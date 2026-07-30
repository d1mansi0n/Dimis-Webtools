import { describe, expect, it } from 'vitest';
import { buildSheet, exportFileName, type ExportLabels } from './export.js';
import { createEntry, pause, start, stop, type Entry } from './model.js';

const CLOCK = (date: Date): string => date.toISOString().slice(11, 19);
const T0 = Date.UTC(2026, 6, 29, 9, 0, 0);
const minutes = (count: number): number => count * 60_000;

const LABELS: ExportLabels = {
  sheet: 'Time entries',
  date: 'Date',
  start: 'Start',
  end: 'End',
  elapsed: 'Elapsed',
  decimal: 'Decimal hours',
  comment: 'Comment',
  sessions: 'Sessions',
  total: 'Total',
};

const identity = (iso: string): string => iso;

const finished = (): Entry[] => {
  let entries = [createEntry(T0)];
  entries = start(entries, T0, T0);
  entries = pause(entries, T0, CLOCK, T0 + minutes(45));
  entries = start(entries, T0, T0 + minutes(60));
  entries = stop(entries, T0, CLOCK, T0 + minutes(90));
  return entries;
};

describe('buildSheet', () => {
  it('writes a header row followed by one row per entry and a total', () => {
    const sheet = buildSheet(finished(), LABELS, identity, T0 + minutes(90));
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.rows[0]).toEqual([
      'Date',
      'Start',
      'End',
      'Elapsed',
      'Decimal hours',
      'Comment',
      'Sessions',
    ]);
  });

  it('reports the first session start and the latest session end', () => {
    const [, entry] = buildSheet(finished(), LABELS, identity, T0 + minutes(90)).rows;
    expect(entry?.[1]).toBe('09:00:00');
    expect(entry?.[2]).toBe('10:30:00');
  });

  it('writes the elapsed time in both formats, the decimal one as a number', () => {
    const [, entry] = buildSheet(finished(), LABELS, identity, T0 + minutes(90)).rows;
    expect(entry?.[3]).toBe('01:15:00');
    expect(entry?.[4]).toBe(1.25);
    expect(typeof entry?.[4]).toBe('number');
  });

  it('lists every session', () => {
    const [, entry] = buildSheet(finished(), LABELS, identity, T0 + minutes(90)).rows;
    expect(entry?.[6]).toBe('09:00:00 – 09:45:00; 10:00:00 – 10:30:00');
  });

  it('totals the elapsed time across entries', () => {
    const entries = [
      ...finished(),
      ...stop(start([createEntry(2)], 2, T0), 2, CLOCK, T0 + minutes(15)),
    ];
    const rows = buildSheet(entries, LABELS, identity, T0 + minutes(90)).rows;
    const total = rows.at(-1);

    expect(total?.[2]).toBe('Total');
    expect(total?.[3]).toBe('01:30:00');
    expect(total?.[4]).toBe(1.5);
  });

  it('includes a still-running entry at its current elapsed time', () => {
    const running = start([createEntry(T0)], T0, T0);
    const [, entry] = buildSheet(running, LABELS, identity, T0 + minutes(30)).rows;
    expect(entry?.[3]).toBe('00:30:00');
  });

  it('marks missing start and end times rather than leaving them blank', () => {
    const [, entry] = buildSheet([createEntry(T0)], LABELS, identity, T0).rows;
    expect(entry?.[1]).toBe('—');
    expect(entry?.[2]).toBe('—');
  });

  it('formats dates through the supplied formatter', () => {
    const [, entry] = buildSheet([createEntry(T0)], LABELS, () => '29/07/2026', T0).rows;
    expect(entry?.[0]).toBe('29/07/2026');
  });

  it('still produces a header and a zero total with no entries', () => {
    const sheet = buildSheet([], LABELS, identity, T0);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[1]?.[3]).toBe('00:00:00');
  });

  it('nominates the decimal column for number formatting', () => {
    expect(buildSheet([], LABELS, identity, T0).decimalColumns).toEqual([4]);
  });

  it('sets a column width for every column', () => {
    const sheet = buildSheet([], LABELS, identity, T0);
    expect(sheet.columns).toHaveLength(sheet.rows[0]?.length ?? 0);
  });

  it("passes the comment through untouched, escaping being the writer's job", () => {
    const withComment = [{ ...createEntry(T0), comment: 'A & B <c> "d"' }];
    const [, entry] = buildSheet(withComment, LABELS, identity, T0).rows;
    expect(entry?.[5]).toBe('A & B <c> "d"');
  });
});

describe('exportFileName', () => {
  it('is sortable and free of locale-specific separators', () => {
    expect(exportFileName('2026-07-29')).toBe('time-entries-2026-07-29.xlsx');
  });
});
