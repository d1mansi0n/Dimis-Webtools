/**
 * Building the CSV export.
 *
 * The row assembly is separated from the download so the exact contents of the
 * file can be asserted in a unit test, which is where the interesting rules live:
 * which time a multi-session entry started and ended, and how the total row is
 * laid out.
 *
 * This used to write a real `.xlsx`, which meant a hand-rolled ZIP container
 * with its own CRC-32 table and central directory, plus a workbook writer for
 * the XML inside it — about 800 lines, tests included, so that a column could
 * carry a number format. CSV costs the few lines below. What it gives up is
 * typed cells: `toDecimalHours` is written with a dot, which a spreadsheet
 * opened under a German locale reads as a thousands separator, so the decimal
 * column is emitted with a comma when the export is German and the file is
 * separated by semicolons to match. That is the convention Excel itself uses
 * for those locales.
 */

import { toDecimalHours, formatDuration } from '../../core/format.js';
import { elapsedOf, type Entry } from './model.js';

export interface ExportLabels {
  readonly sheet: string;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly elapsed: string;
  readonly decimal: string;
  readonly comment: string;
  readonly sessions: string;
  readonly total: string;
}

/** Shown where an entry has no recorded session to take a time from. */
const NOT_AVAILABLE = '—';

export interface CsvOptions {
  /**
   * Whether to write decimals with a comma and separate fields with semicolons.
   * True for locales whose spreadsheets expect it, which is what `de` needs.
   */
  readonly commaDecimal: boolean;
}

export function buildRows(
  entries: readonly Entry[],
  labels: ExportLabels,
  formatDate: (iso: string) => string,
  now: number = Date.now(),
): string[][] {
  const header = [
    labels.date,
    labels.start,
    labels.end,
    labels.elapsed,
    labels.decimal,
    labels.comment,
    labels.sessions,
  ];

  let total = 0;
  const rows: string[][] = [header];

  for (const entry of entries) {
    const elapsed = elapsedOf(entry, now);
    total += elapsed;

    const first = entry.sessions.at(0);
    /* The latest end time, not the last session's: sessions are appended in the
       order they closed, which for a paused-and-resumed entry is already
       chronological, but comparing is cheap and cannot be wrong. */
    const last = entry.sessions.reduce<string | undefined>(
      (latest, session) => (latest === undefined || session.to > latest ? session.to : latest),
      undefined,
    );

    rows.push([
      formatDate(entry.date),
      first?.from ?? NOT_AVAILABLE,
      last ?? NOT_AVAILABLE,
      formatDuration(elapsed),
      toDecimalHours(elapsed).toFixed(2),
      entry.comment,
      entry.sessions.map((session) => `${session.from} – ${session.to}`).join('; '),
    ]);
  }

  rows.push([
    '',
    '',
    labels.total,
    formatDuration(total),
    toDecimalHours(total).toFixed(2),
    '',
    '',
  ]);

  return rows;
}

/**
 * Render rows as CSV.
 *
 * Quoting follows RFC 4180: a field is quoted when it contains the separator, a
 * quote or a line break, and an embedded quote is doubled. Comments are free
 * text typed by the user, so every one of those cases is reachable — a comment
 * containing a semicolon is exactly how a naive export corrupts a whole column.
 */
export function toCsv(rows: readonly string[][], options: CsvOptions): string {
  const separator = options.commaDecimal ? ';' : ',';

  const field = (value: string, column: number): string => {
    /* Only the decimal-hours column is a number; the rest are text, and a time
       like "01:30:00" must not have its colons touched. */
    const text = options.commaDecimal && column === 4 ? value.replace('.', ',') : value;
    /* Quoted for *this* file's separator, not for both. Testing for a comma in a
       semicolon-separated file wrapped every German decimal in quotes, which is
       how "1,25" reached the spreadsheet as the text `"1,25"`. */
    const needsQuoting = text.includes(separator) || /["\n\r]/.test(text);
    return needsQuoting ? `"${text.replaceAll('"', '""')}"` : text;
  };

  /* CRLF, which RFC 4180 specifies and Excel is happiest with. */
  return rows.map((row) => row.map(field).join(separator)).join('\r\n');
}

/** File name for the export, e.g. `time-entries-2026-07-29.csv`. */
export function exportFileName(isoDate: string): string {
  return `time-entries-${isoDate}.csv`;
}

/**
 * Hand the file to the browser as a download.
 *
 * A blob URL rather than a `data:` URL: it avoids materialising the whole file
 * as a base64 string, and it keeps `img-src`/`default-src` in the Content
 * Security Policy free of `data:`.
 *
 * The byte-order mark is not decoration. Excel opens a CSV as the system's
 * legacy code page unless one is present, which turns every umlaut and the
 * en dash between session times into mojibake.
 */
export function downloadCsv(csv: string, fileName: string): void {
  /* Written as an escape, not as the character itself: a literal BOM in a source
     file is invisible in every editor and makes the file binary to `grep`. */
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.click();

  /* Revoked on the next turn of the event loop: revoking synchronously can race
     the browser's own fetch of the URL in some engines. */
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
