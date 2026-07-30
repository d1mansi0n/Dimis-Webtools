/**
 * Validated, namespaced, failure-tolerant persistence.
 *
 * All of this site's data is the user's own and never leaves their browser, so
 * `localStorage` is the right home for it. What `localStorage` does not give us
 * is any guarantee about what comes back out, and the previous version of these
 * tools assumed it did. Three concrete problems are handled here:
 *
 *  1. **Untrusted contents.** Values are decoded through a schema on every read.
 *     Data that no longer matches is quarantined rather than crashing the page,
 *     so a corrupt save can be inspected instead of silently destroying a boot.
 *
 *  2. **Storage that is not there.** Safari's private mode, disabled cookies and
 *     locked-down enterprise profiles all make `localStorage` throw on *access*,
 *     not just on write. A session-lifetime in-memory store takes over, so the
 *     tools still work for as long as the tab is open.
 *
 *  3. **A full quota.** Writes report failure instead of throwing, which lets a
 *     tool tell the user their save did not happen rather than pretending it did.
 *
 * Keys are namespaced under `dwt:` so this site cannot collide with anything
 * else on the origin, with an explicit, one-time migration path from the
 * unprefixed keys the 1.0 and 2.0 tools used.
 */

import { err, ok, type Result } from './result.js';
import { decodeJson, type Decoder } from './schema.js';

const NAMESPACE = 'dwt:';

/** Suffix appended to a key when its contents fail to decode. */
const QUARANTINE_SUFFIX = '!corrupt';

export type StorageFailure =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'quota-exceeded' }
  | { readonly kind: 'write-failed'; readonly message: string };

export interface Store<T> {
  /** The fully namespaced key this store owns. */
  readonly key: string;
  /** Decode the stored value, falling back to the default when absent or invalid. */
  read(): T;
  /** Persist a value. Returns a failure rather than throwing when it cannot. */
  write(value: T): Result<void, StorageFailure>;
  /** Remove the stored value. */
  clear(): void;
}

export interface StoreOptions<T> {
  /** Key within the `dwt:` namespace. */
  readonly key: string;
  readonly decoder: Decoder<T>;
  /** Produces a fresh default. A factory, so callers cannot share mutable state. */
  readonly fallback: () => T;
  /**
   * A pre-namespace key written by the 1.0/2.0 tools. When the namespaced key is
   * empty and this one decodes, its value is adopted and written forward. The
   * legacy key is left in place: migration stays non-destructive, so rolling
   * back to the archived version does not lose anything.
   */
  readonly legacy?: {
    readonly key: string;
    readonly decoder: Decoder<T>;
  };
}

/* --------------------------------------------------------------- backing store */

/**
 * A `localStorage`-shaped surface. Narrower than the DOM `Storage` interface so
 * the in-memory fallback only has to implement what is actually used.
 */
interface Backing {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly persistent: boolean;
}

function memoryBacking(): Backing {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    persistent: false,
  };
}

function detectBacking(): Backing {
  try {
    const probe = `${NAMESPACE}probe`;
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    const real = globalThis.localStorage;
    return {
      getItem: (key) => real.getItem(key),
      setItem: (key, value) => {
        real.setItem(key, value);
      },
      removeItem: (key) => {
        real.removeItem(key);
      },
      persistent: true,
    };
  } catch {
    return memoryBacking();
  }
}

let backing: Backing | undefined;

function store(): Backing {
  backing ??= detectBacking();
  return backing;
}

/** True when writes will outlive the tab. Tools surface this to the user. */
export function isPersistent(): boolean {
  return store().persistent;
}

/** Test seam: forget the detected backing so the next call re-probes. */
export function resetStorageForTesting(): void {
  backing = undefined;
}

/* ---------------------------------------------------------------------- stores */

export function defineStore<T>(options: StoreOptions<T>): Store<T> {
  const key = NAMESPACE + options.key;

  const persist = (value: T): Result<void, StorageFailure> => {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch (cause) {
      return err({
        kind: 'write-failed',
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
    try {
      store().setItem(key, serialized);
      return ok(undefined);
    } catch (cause) {
      return err(classifyWriteFailure(cause));
    }
  };

  return {
    key,

    read(): T {
      const raw = store().getItem(key);

      if (raw === null) {
        const migrated = migrate(options);
        if (migrated !== undefined) {
          /* A failed forward-write is not fatal: the value is still correct for
             this session, and the legacy key remains as the source of truth. */
          persist(migrated);
          return migrated;
        }
        return options.fallback();
      }

      const decoded = decodeJson(options.decoder, raw);
      if (decoded.ok) return decoded.value;

      quarantine(key, raw, decoded.error);
      return options.fallback();
    },

    write: persist,

    clear(): void {
      try {
        store().removeItem(key);
      } catch {
        /* Removing a key that cannot be removed leaves the old value in place;
           there is nothing useful to do about it and nothing to report. */
      }
    },
  };
}

function migrate<T>(options: StoreOptions<T>): T | undefined {
  const legacy = options.legacy;
  if (legacy === undefined) return undefined;

  const raw = store().getItem(legacy.key);
  if (raw === null) return undefined;

  const decoded = decodeJson(legacy.decoder, raw);
  if (!decoded.ok) {
    console.warn(`[storage] ignoring unreadable legacy key "${legacy.key}": ${decoded.error}`);
    return undefined;
  }
  return decoded.value;
}

/**
 * Move an undecodable value aside.
 *
 * Overwriting the quarantine slot rather than appending a timestamped copy keeps
 * a repeatedly-corrupt key from growing without bound, which would eventually
 * exhaust the very quota we are trying to protect.
 */
function quarantine(key: string, raw: string, reason: string): void {
  console.warn(`[storage] "${key}" did not match its schema and was set aside: ${reason}`);
  try {
    store().setItem(key + QUARANTINE_SUFFIX, raw);
  } catch {
    /* No room to keep a copy — dropping the bad value is still better than
       booting into a broken state. */
  }
  try {
    store().removeItem(key);
  } catch {
    /* Ignored for the same reason. */
  }
}

/** Read a property off an unknown thrown value without assuming its prototype. */
function property(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Decide whether a failed write means "out of room" or something else.
 *
 * Deliberately duck-typed rather than using `instanceof DOMException`: a
 * `DOMException` thrown in another realm — an iframe, a worker, or jsdom under
 * test — fails that check even though it is exactly the error we mean. Browsers
 * also disagree on how they signal a full quota, so the name and both legacy
 * numeric codes are all accepted (Firefox reports `NS_ERROR_DOM_QUOTA_REACHED`
 * with code 1014, everyone else `QuotaExceededError` with code 22).
 */
function classifyWriteFailure(cause: unknown): StorageFailure {
  const name = property(cause, 'name');
  const code = property(cause, 'code');
  if (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  ) {
    return { kind: 'quota-exceeded' };
  }

  const message = property(cause, 'message');
  return {
    kind: 'write-failed',
    message: typeof message === 'string' ? message : safeString(cause),
  };
}

/** Describe an unknown thrown value without risking "[object Object]". */
function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'unknown error';
}
