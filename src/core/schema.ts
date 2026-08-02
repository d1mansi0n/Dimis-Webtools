/**
 * A minimal runtime schema validator.
 *
 * `localStorage` is untrusted input. It survives across versions of this code,
 * it is editable by hand in devtools, and it is shared with every other script
 * that ever runs on this origin. The previous version of these tools read it
 * with a bare `JSON.parse` and indexed straight into the result, so a single
 * malformed entry turned into a `TypeError` on boot and an unusable page.
 *
 * Every decoder here is total: it either produces a value of the declared type
 * or an error describing where the input went wrong. Nothing throws.
 *
 * This exists instead of a dependency because the whole site ships zero
 * third-party runtime code, and the subset actually needed is about 150 lines.
 */

import { err, ok, type Result } from './result.js';

/** Decodes unknown input into `T`, reporting the path at which it failed. */
export type Decoder<T> = (input: unknown, path?: string) => Result<T>;

/** The type a decoder yields. Not exported: only `objectOf` below needs it. */
type Infer<D> = D extends Decoder<infer T> ? T : never;

const at = (path: string): string => (path === '' ? 'value' : path);

const fail = (path: string, expected: string, actual: unknown): Result<never> =>
  err(`${at(path)}: expected ${expected}, got ${describe(actual)}`);

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

/* ------------------------------------------------------------------ primitives */

export const string: Decoder<string> = (input, path = '') =>
  typeof input === 'string' ? ok(input) : fail(path, 'a string', input);

export const boolean: Decoder<boolean> = (input, path = '') =>
  typeof input === 'boolean' ? ok(input) : fail(path, 'a boolean', input);

/**
 * A finite number. `NaN` and the infinities are rejected on purpose: they
 * round-trip through JSON as `null`, and every numeric field in this codebase
 * (elapsed milliseconds, ratios, coordinates) is meaningless if unbounded.
 */
export const number: Decoder<number> = (input, path = '') =>
  typeof input === 'number' && Number.isFinite(input)
    ? ok(input)
    : fail(path, 'a finite number', input);

export const integer: Decoder<number> = (input, path = '') =>
  typeof input === 'number' && Number.isSafeInteger(input)
    ? ok(input)
    : fail(path, 'a safe integer', input);

/* ------------------------------------------------------------------ refinements */

/** Constrain a numeric decoder to an inclusive range. */
export function inRange(inner: Decoder<number>, min: number, max: number): Decoder<number> {
  return (input, path = '') => {
    const result = inner(input, path);
    if (!result.ok) return result;
    if (result.value < min || result.value > max) {
      return err(
        `${at(path)}: expected a number between ${String(min)} and ${String(max)}, got ${String(result.value)}`,
      );
    }
    return result;
  };
}

/**
 * Cap a string's length.
 *
 * Persisted free text (time-tracking comments, most of all) is echoed back into
 * the DOM and into exported spreadsheets. Bounding it at the decode boundary
 * keeps a hostile or accidental multi-megabyte value from becoming a rendering
 * or export problem later.
 */
export function maxLength(inner: Decoder<string>, limit: number): Decoder<string> {
  return (input, path = '') => {
    const result = inner(input, path);
    if (!result.ok) return result;
    return result.value.length <= limit
      ? result
      : err(
          `${at(path)}: expected at most ${String(limit)} characters, got ${String(result.value.length)}`,
        );
  };
}

/** Accept only one of a fixed set of literal values. */
export function literals<const T extends readonly (string | number | boolean)[]>(
  ...allowed: T
): Decoder<T[number]> {
  return (input, path = '') =>
    allowed.includes(input as T[number])
      ? ok(input as T[number])
      : fail(path, `one of ${allowed.map((value) => JSON.stringify(value)).join(', ')}`, input);
}

/* ------------------------------------------------------------------ structures */

export function arrayOf<T>(item: Decoder<T>): Decoder<T[]> {
  return (input, path = '') => {
    if (!Array.isArray(input)) return fail(path, 'an array', input);
    const out: T[] = [];
    for (let index = 0; index < input.length; index++) {
      const result = item(input[index], `${path}[${String(index)}]`);
      if (!result.ok) return result;
      out.push(result.value);
    }
    return ok(out);
  };
}

/** A fixed-length array where every element decodes with `item`. */
export function tupleOf<T>(item: Decoder<T>, length: number): Decoder<T[]> {
  return (input, path = '') => {
    if (!Array.isArray(input)) return fail(path, 'an array', input);
    if (input.length !== length) {
      return err(`${at(path)}: expected ${String(length)} items, got ${String(input.length)}`);
    }
    return arrayOf(item)(input, path);
  };
}

export function objectOf<S extends Record<string, Decoder<unknown>>>(
  shape: S,
): Decoder<{ [K in keyof S]: Infer<S[K]> }> {
  return (input, path = '') => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return fail(path, 'an object', input);
    }
    const source = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const decoder = shape[key];
      /* istanbul ignore next -- Object.keys cannot yield a missing entry */
      if (decoder === undefined) continue;
      const result = decoder(source[key], path === '' ? key : `${path}.${key}`);
      if (!result.ok) return result;
      out[key] = result.value;
    }
    return ok(out as { [K in keyof S]: Infer<S[K]> });
  };
}

/**
 * Allow the value to be absent *or* explicitly `null`.
 *
 * This is the only way to spell "may have no value", on purpose. There used to
 * be an `optional` beside it that accepted a missing field but rejected an
 * explicit `null` — and since JSON has no `undefined`, data written by the 2.0
 * tools is full of `"runningSince": null`, so reaching for the wrong one of the
 * two silently discarded every record that had ever been paused. With one
 * function there is no wrong one to reach for.
 */
export function nullish<T>(inner: Decoder<T>): Decoder<T | undefined> {
  return (input, path = '') =>
    input === undefined || input === null ? ok(undefined) : inner(input, path);
}

/** Substitute `fallback` when the value is missing or fails to decode. */
export function withDefault<T>(inner: Decoder<T>, fallback: T): Decoder<T> {
  return (input, path = '') => {
    if (input === undefined || input === null) return ok(fallback);
    const result = inner(input, path);
    return result.ok ? result : ok(fallback);
  };
}

/**
 * Decode an array, dropping the elements that fail instead of rejecting the
 * whole collection.
 *
 * This is the right trade-off for user-owned lists: if one of forty saved time
 * entries is corrupt, losing that one entry is far better than losing all forty.
 * Use `arrayOf` where partial data would be worse than no data.
 */
export function lenientArrayOf<T>(item: Decoder<T>): Decoder<T[]> {
  return (input, path = '') => {
    if (!Array.isArray(input)) return fail(path, 'an array', input);
    const out: T[] = [];
    for (let index = 0; index < input.length; index++) {
      const result = item(input[index], `${path}[${String(index)}]`);
      if (result.ok) out.push(result.value);
    }
    return ok(out);
  };
}

/** Parse a JSON string and decode the result in one step. */
export function decodeJson<T>(decoder: Decoder<T>, raw: string): Result<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err(`invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  return decoder(parsed);
}
