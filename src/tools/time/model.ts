/**
 * Time Tracking — state, persistence and the rules that move entries between
 * their states.
 *
 * Everything here is pure or storage-bound; nothing touches the DOM. That is
 * what makes the timer arithmetic — historically the buggiest part of this
 * tool — testable without a browser and without waiting for real seconds to
 * pass.
 */

import {
  boolean,
  integer,
  lenientArrayOf,
  maxLength,
  nullish,
  number,
  objectOf,
  string,
  withDefault,
  type Decoder,
} from '../../core/schema.js';
import { defineStore, type Store } from '../../core/storage.js';
import { legacyDateToIso, toIsoDate } from '../../core/format.js';

/** Longest comment we will store, so a pasted wall of text cannot fill storage. */
export const MAX_COMMENT_LENGTH = 500;

/** Most remembered comment suggestions. Oldest are dropped first. */
export const MAX_COMMENTS = 200;

/**
 * How often a running entry folds its elapsed time into `accumulated`.
 *
 * See `Active` below for why this exists.
 */
export const HEARTBEAT_MS = 1000;

/** A completed stretch of work, as wall-clock times for display and export. */
export interface Session {
  /** `HH:MM:SS` when the stretch began. */
  readonly from: string;
  /** `HH:MM:SS` when it ended. */
  readonly to: string;
}

/**
 * The bookkeeping for an entry whose timer is running.
 *
 * Two timestamps rather than one, because they answer different questions:
 *
 *  - `startedAt` is when the current stretch began, and only ever feeds the
 *    "09:00:00 – now" label.
 *  - `countedTo` is the instant up to which time has already been added to
 *    `accumulated`. A heartbeat advances it every second.
 *
 * Keeping `accumulated` current-to-the-last-heartbeat is what fixes a real bug
 * in version 2.0: it persisted only the start timestamp and computed elapsed
 * time as `now - start` on load, so closing the laptop with a timer running and
 * reopening it the next morning credited the entry with the whole night. Here,
 * a session interrupted by the tab closing is closed at `countedTo` — the last
 * moment the page was demonstrably open — and loses at most one second.
 */
export interface Active {
  readonly startedAt: number;
  readonly countedTo: number;
}

export interface Entry {
  /** Creation timestamp, used as a stable identity. */
  readonly id: number;
  /** ISO `YYYY-MM-DD`. Stored locale-independently; formatted only for display. */
  readonly date: string;
  readonly comment: string;
  /** Milliseconds banked from finished and heartbeat-folded stretches. */
  readonly accumulated: number;
  readonly isStopped: boolean;
  readonly sessions: readonly Session[];
  /** Non-null exactly when the timer is running. */
  readonly active: Active | null;
}

/* -------------------------------------------------------------- decoders */

const sessionDecoder: Decoder<Session> = objectOf({
  from: maxLength(string, 32),
  to: maxLength(string, 32),
});

const activeDecoder: Decoder<Active | null> = (input, path) => {
  if (input === null || input === undefined) return { ok: true, value: null };
  return objectOf({ startedAt: integer, countedTo: integer })(input, path);
};

const entryDecoder: Decoder<Entry> = objectOf({
  id: integer,
  date: string,
  comment: withDefault(maxLength(string, MAX_COMMENT_LENGTH), ''),
  accumulated: withDefault(number, 0),
  isStopped: withDefault(boolean, false),
  sessions: withDefault(lenientArrayOf(sessionDecoder), []),
  active: activeDecoder,
});

/**
 * Entries are decoded leniently: one unreadable entry costs the user that entry,
 * not the whole day's tracking.
 */
const entriesDecoder = lenientArrayOf(entryDecoder);

const commentsDecoder: Decoder<string[]> = (input, path) => {
  const decoded = lenientArrayOf(maxLength(string, MAX_COMMENT_LENGTH))(input, path);
  return decoded.ok ? { ok: true, value: decoded.value.slice(-MAX_COMMENTS) } : decoded;
};

/* ------------------------------------------------------------- migration */

/**
 * The entry shape written by version 2.0.
 *
 * Two differences matter: the date was a German-formatted `DD.MM.YY` string, and
 * a running timer was represented by a bare `runningSince` timestamp.
 */
const legacyEntryDecoder = objectOf({
  id: integer,
  /* Every field here is `nullish` rather than `optional`: the 2.0 tool wrote
     explicit `null`s for fields it had no value for, and JSON has no other way
     to say "empty". Treating those as decode failures would have thrown away
     every record that was ever paused. */
  date: nullish(string),
  comment: nullish(string),
  accumulated: nullish(number),
  elapsed: nullish(number), // version 1.0's name for the same field
  isStopped: nullish(boolean),
  sessions: withDefault(lenientArrayOf(sessionDecoder), []),
  runningSince: nullish(number),
});

const legacyEntriesDecoder: Decoder<Entry[]> = (input, path) => {
  const decoded = lenientArrayOf(legacyEntryDecoder)(input, path);
  if (!decoded.ok) return decoded;

  return {
    ok: true,
    value: decoded.value.map((old) => ({
      id: old.id,
      date:
        (old.date === undefined ? undefined : legacyDateToIso(old.date)) ?? toIsoDate(new Date()),
      comment: (old.comment ?? '').slice(0, MAX_COMMENT_LENGTH),
      /* A timer still marked as running in the old data is banked at its start
         time rather than credited with everything since. */
      accumulated: old.accumulated ?? old.elapsed ?? 0,
      isStopped: old.isStopped ?? false,
      sessions: old.sessions,
      active: null,
    })),
  };
};

/* ---------------------------------------------------------------- stores */

export function createEntryStore(): Store<Entry[]> {
  return defineStore({
    key: 'time.entries',
    decoder: entriesDecoder,
    fallback: () => [],
    legacy: { key: 'timeTrackerEntriesV2', decoder: legacyEntriesDecoder },
  });
}

export function createCommentStore(): Store<string[]> {
  return defineStore({
    key: 'time.comments',
    decoder: commentsDecoder,
    fallback: () => [],
    /* Both 1.0 and 2.0 shared this unprefixed key. */
    legacy: { key: 'comments', decoder: commentsDecoder },
  });
}

export function createDecimalPreferenceStore(): Store<boolean> {
  return defineStore({
    key: 'time.decimal',
    decoder: boolean,
    fallback: () => false,
    legacy: {
      /* 2.0 stored the string "1" or "0", not JSON. */
      key: 'timeTrackerDecimal',
      decoder: (input) => ({ ok: true, value: input === 1 }),
    },
  });
}

/* ----------------------------------------------------------- pure state */

export function createEntry(now: number = Date.now()): Entry {
  return {
    id: now,
    date: toIsoDate(new Date(now)),
    comment: '',
    accumulated: 0,
    isStopped: false,
    sessions: [],
    active: null,
  };
}

/** Total tracked milliseconds, including the stretch currently in progress. */
export function elapsedOf(entry: Entry, now: number = Date.now()): number {
  if (entry.active === null) return entry.accumulated;
  return entry.accumulated + Math.max(0, now - entry.active.countedTo);
}

export function totalElapsed(entries: readonly Entry[], now: number = Date.now()): number {
  return entries.reduce((sum, entry) => sum + elapsedOf(entry, now), 0);
}

export function runningEntry(entries: readonly Entry[]): Entry | undefined {
  return entries.find((entry) => entry.active !== null);
}

/**
 * Start an entry's timer.
 *
 * Only one entry may run at a time — the constraint version 2.0 enforced with a
 * message, kept here because tracking two things at once is almost always a
 * mis-click rather than an intention.
 */
export function start(entries: readonly Entry[], id: number, now: number = Date.now()): Entry[] {
  const running = runningEntry(entries);
  if (running !== undefined && running.id !== id) return [...entries];

  return entries.map((entry) =>
    entry.id === id && !entry.isStopped && entry.active === null
      ? { ...entry, active: { startedAt: now, countedTo: now } }
      : entry,
  );
}

/** Fold the running stretch into `accumulated` and record it as a session. */
function close(entry: Entry, now: number, formatTime: (date: Date) => string): Entry {
  if (entry.active === null) return entry;
  return {
    ...entry,
    accumulated: entry.accumulated + Math.max(0, now - entry.active.countedTo),
    sessions: [
      ...entry.sessions,
      { from: formatTime(new Date(entry.active.startedAt)), to: formatTime(new Date(now)) },
    ],
    active: null,
  };
}

export function pause(
  entries: readonly Entry[],
  id: number,
  formatTime: (date: Date) => string,
  now: number = Date.now(),
): Entry[] {
  return entries.map((entry) => (entry.id === id ? close(entry, now, formatTime) : entry));
}

export function stop(
  entries: readonly Entry[],
  id: number,
  formatTime: (date: Date) => string,
  now: number = Date.now(),
): Entry[] {
  return entries.map((entry) =>
    entry.id === id && !entry.isStopped
      ? { ...close(entry, now, formatTime), isStopped: true }
      : entry,
  );
}

export function remove(entries: readonly Entry[], id: number): Entry[] {
  return entries.filter((entry) => entry.id !== id);
}

/**
 * Set an entry's comment.
 *
 * Deliberately allowed on a finished entry, unlike in versions 1.0 and 2.0,
 * where stopping the timer locked the comment for good. Remembering what a
 * stretch of work was about is something people do *after* finishing it, and
 * having no way to write it down was the sharpest edge this tool had.
 */
export function setComment(entries: readonly Entry[], id: number, comment: string): Entry[] {
  const trimmed = comment.slice(0, MAX_COMMENT_LENGTH);
  return entries.map((entry) => (entry.id === id ? { ...entry, comment: trimmed } : entry));
}

/**
 * The longest duration an entry may be corrected to: a thousand hours.
 *
 * A bound rather than no bound, because this value is typed by hand and then
 * stored, and every other stored number in this codebase is bounded too.
 */
export const MAX_ELAPSED_MS = 1000 * 60 * 60 * 1000;

/**
 * Correct a finished entry's total.
 *
 * The case this exists for is the timer left running through lunch, or over a
 * whole night. Until now the only remedy was to delete the entry and lose the
 * comment and the session times with it.
 *
 * Only finished entries can be corrected: rewriting the total of an entry whose
 * timer is still running would be undone by the next heartbeat a second later.
 */
export function setElapsed(entries: readonly Entry[], id: number, ms: number): Entry[] {
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_ELAPSED_MS) return [...entries];

  return entries.map((entry) =>
    entry.id === id && entry.isStopped && entry.active === null
      ? { ...entry, accumulated: Math.round(ms) }
      : entry,
  );
}

/**
 * Undo a stop, so tracking can continue on the same entry.
 *
 * Stopping is a single click next to Pause and is easy to hit by mistake; before
 * this, that mistake cost the entry. The banked time and the recorded sessions
 * are untouched — reopening only makes the entry writable again.
 */
export function reopen(entries: readonly Entry[], id: number): Entry[] {
  return entries.map((entry) =>
    entry.id === id && entry.isStopped ? { ...entry, isStopped: false } : entry,
  );
}

/** Advance the heartbeat, banking the time counted so far. */
export function heartbeat(entries: readonly Entry[], now: number = Date.now()): Entry[] {
  return entries.map((entry) =>
    entry.active === null
      ? entry
      : {
          ...entry,
          accumulated: entry.accumulated + Math.max(0, now - entry.active.countedTo),
          active: { startedAt: entry.active.startedAt, countedTo: now },
        },
  );
}

/**
 * Close any stretch that was still open when the page was last closed.
 *
 * Called once at load. `countedTo` is the last heartbeat, so the recovered
 * session ends when the page actually stopped running rather than now.
 */
export function recoverInterrupted(
  entries: readonly Entry[],
  formatTime: (date: Date) => string,
): Entry[] {
  return entries.map((entry) =>
    entry.active === null ? entry : close(entry, entry.active.countedTo, formatTime),
  );
}

/** Add a comment to the remembered suggestions, most recent last, without duplicates. */
export function rememberComment(comments: readonly string[], comment: string): string[] {
  const trimmed = comment.trim().slice(0, MAX_COMMENT_LENGTH);
  if (trimmed === '') return [...comments];
  return [...comments.filter((existing) => existing !== trimmed), trimmed].slice(-MAX_COMMENTS);
}
