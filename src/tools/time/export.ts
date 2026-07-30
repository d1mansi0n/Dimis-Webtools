/**
 * Building the spreadsheet export.
 *
 * The row assembly is separated from the download so the exact contents of the
 * file can be asserted in a unit test, which is where the interesting rules live:
 * which time a multi-session entry started and ended, and how the total row is
 * laid out.
 */

import { toDecimalHours, formatDuration } from '../../core/format.js';
import { createWorkbook, XLSX_MIME_TYPE, type Sheet } from '../../lib/xlsx/workbook.js';
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

/** Zero-based index of the decimal-hours column, for number formatting. */
const DECIMAL_COLUMN = 4;

const COLUMN_WIDTHS = [12, 12, 12, 20, 15, 40, 50];

/** Shown where an entry has no recorded session to take a time from. */
const NOT_AVAILABLE = '—';

export function buildSheet(
  entries: readonly Entry[],
  labels: ExportLabels,
  formatDate: (iso: string) => string,
  now: number = Date.now(),
): Sheet {
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
  const rows: (string | number)[][] = [header];

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
      toDecimalHours(elapsed),
      entry.comment,
      entry.sessions.map((session) => `${session.from} – ${session.to}`).join('; '),
    ]);
  }

  rows.push(['', '', labels.total, formatDuration(total), toDecimalHours(total), '', '']);

  return {
    name: labels.sheet,
    rows,
    columns: COLUMN_WIDTHS.map((width) => ({ width })),
    decimalColumns: [DECIMAL_COLUMN],
  };
}

/** File name for the export, e.g. `time-entries-2026-07-29.xlsx`. */
export function exportFileName(isoDate: string): string {
  return `time-entries-${isoDate}.xlsx`;
}

/**
 * Hand the workbook to the browser as a download.
 *
 * A blob URL rather than a `data:` URL: it avoids materialising the whole file
 * as a base64 string, and it keeps `img-src`/`default-src` in the Content
 * Security Policy free of `data:`.
 */
export function downloadWorkbook(sheet: Sheet, fileName: string): void {
  const bytes = createWorkbook(sheet);
  const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME_TYPE });
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
