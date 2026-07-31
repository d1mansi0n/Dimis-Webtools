/**
 * Time and date formatting.
 *
 * One rule runs through this module: **stored values are locale-independent,
 * displayed values are localised**. The 1.0 and 2.0 tools stored dates as the
 * German-formatted string `"29.07.26"`, which cannot be sorted, cannot be
 * compared, and cannot be re-read in another locale. Entries are now stored as
 * ISO `YYYY-MM-DD` and formatted for display through `Intl` at the last moment.
 */

const pad2 = (value: number): string => String(value).padStart(2, '0');

const MS_PER_SECOND = 1000;
const MS_PER_HOUR = 3_600_000;

/*
 * `Intl` formatters are expensive to build and cheap to reuse — constructing one
 * costs tens of microseconds against well under one for a `format()` call on an
 * instance that already exists. That is invisible until it happens in a loop:
 * the Recipes list formats a few hundred amounts per render, which put several
 * milliseconds of pure allocation into every tap on a phone.
 *
 * The caches below are keyed by everything that varies, and the key space is
 * bounded by the two locales the site ships and the handful of fraction-digit
 * settings its callers ask for, so they cannot grow without limit.
 */

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const timestampFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();

function cached<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const created = create();
  cache.set(key, created);
  return created;
}

/**
 * Elapsed milliseconds as `HH:MM:SS`.
 *
 * Hours are not wrapped at 24: this measures a duration, not a time of day, and
 * a 30-hour total should read as `30:00:00`.
 */
export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(safe / MS_PER_SECOND);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

/** Elapsed milliseconds as decimal hours, rounded to two places. */
export function toDecimalHours(ms: number): number {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return Math.round((safe / MS_PER_HOUR) * 100) / 100;
}

/** Whole seconds as `MM:SS`, for the Sudoku clock. */
export function formatStopwatch(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

/** A `Date`'s wall-clock time as `HH:MM:SS`. */
export function formatTimeOfDay(date: Date): string {
  if (Number.isNaN(date.getTime())) return '00:00:00';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/**
 * A `Date` as an ISO calendar date in the *local* time zone.
 *
 * `toISOString()` would convert to UTC first and silently shift late-evening
 * entries into the next day for anyone east of Greenwich, so the components are
 * read locally instead.
 */
export function toIsoDate(date: Date): string {
  return `${String(date.getFullYear())}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** An ISO `YYYY-MM-DD` string formatted for display in the given locale. */
export function formatIsoDate(iso: string, locale: string): string {
  const parsed = parseIsoDate(iso);
  if (parsed === undefined) return iso;
  return cached(
    dateFormats,
    locale,
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
  ).format(parsed);
}

/** A timestamp formatted as date and time for the given locale. */
export function formatTimestamp(ms: number, locale: string): string {
  return cached(
    timestampFormats,
    locale,
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
  ).format(new Date(ms));
}

/** Parse a strict ISO `YYYY-MM-DD`, rejecting anything else. */
export function parseIsoDate(iso: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) return undefined;
  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return undefined;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  /* Guards against `2026-02-31` rolling over into March. */
  return date.getMonth() === Number(month) - 1 ? date : undefined;
}

/**
 * Convert the legacy `DD.MM.YY` date strings written by the 1.0/2.0 time tracker
 * into ISO form. Two-digit years are read as 2000-2099, which covers every date
 * those versions could have produced.
 */
export function legacyDateToIso(value: string): string | undefined {
  const match = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(value);
  if (match === null) return undefined;
  const [, day, month, year] = match;
  if (day === undefined || month === undefined || year === undefined) return undefined;
  const iso = `20${year}-${month}-${day}`;
  return parseIsoDate(iso) === undefined ? undefined : iso;
}

/** A number formatted for the given locale, at most `maximumFractionDigits` places. */
export function formatNumber(value: number, locale: string, maximumFractionDigits = 1): string {
  return cached(
    numberFormats,
    `${locale}:${String(maximumFractionDigits)}`,
    () => new Intl.NumberFormat(locale, { maximumFractionDigits }),
  ).format(value);
}
