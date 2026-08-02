import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRows, downloadCsv, exportFileName, toCsv, type ExportLabels } from './export.js';
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

describe('buildRows', () => {
  it('writes a header row followed by one row per entry and a total', () => {
    const rows = buildRows(finished(), LABELS, identity, T0 + minutes(90));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual([
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
    const [, entry] = buildRows(finished(), LABELS, identity, T0 + minutes(90));
    expect(entry?.[1]).toBe('09:00:00');
    expect(entry?.[2]).toBe('10:30:00');
  });

  it('reports the latest end time even when the sessions are not in order', () => {
    /* Sessions are appended in the order they closed, which is chronological for
       a paused-and-resumed entry — but the export takes the *latest* end rather
       than the last recorded one, so that hand-edited or migrated data cannot
       produce an entry that appears to have finished before it did. */
    const [entry] = finished();
    const scrambled: Entry[] = [{ ...entry!, sessions: [...entry!.sessions].reverse() }];

    const [, row] = buildRows(scrambled, LABELS, identity, T0 + minutes(90));
    expect(row?.[2]).toBe('10:30:00');
  });

  it('writes the elapsed time in both formats, the decimal one to two places', () => {
    const [, entry] = buildRows(finished(), LABELS, identity, T0 + minutes(90));
    expect(entry?.[3]).toBe('01:15:00');
    expect(entry?.[4]).toBe('1.25');
  });

  it('lists every session', () => {
    const [, entry] = buildRows(finished(), LABELS, identity, T0 + minutes(90));
    expect(entry?.[6]).toBe('09:00:00 – 09:45:00; 10:00:00 – 10:30:00');
  });

  it('totals the elapsed time across entries', () => {
    const entries = [
      ...finished(),
      ...stop(start([createEntry(2)], 2, T0), 2, CLOCK, T0 + minutes(15)),
    ];
    const rows = buildRows(entries, LABELS, identity, T0 + minutes(90));
    const total = rows.at(-1);

    expect(total?.[2]).toBe('Total');
    expect(total?.[3]).toBe('01:30:00');
    expect(total?.[4]).toBe('1.50');
  });

  it('includes a still-running entry at its current elapsed time', () => {
    const running = start([createEntry(T0)], T0, T0);
    const [, entry] = buildRows(running, LABELS, identity, T0 + minutes(30));
    expect(entry?.[3]).toBe('00:30:00');
  });

  it('marks missing start and end times rather than leaving them blank', () => {
    const [, entry] = buildRows([createEntry(T0)], LABELS, identity, T0);
    expect(entry?.[1]).toBe('—');
    expect(entry?.[2]).toBe('—');
  });

  it('formats dates through the supplied formatter', () => {
    const [, entry] = buildRows([createEntry(T0)], LABELS, () => '29/07/2026', T0);
    expect(entry?.[0]).toBe('29/07/2026');
  });

  it('still produces a header and a zero total with no entries', () => {
    const rows = buildRows([], LABELS, identity, T0);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.[3]).toBe('00:00:00');
  });

  it("passes the comment through untouched, escaping being the writer's job", () => {
    const withComment = [{ ...createEntry(T0), comment: 'A & B <c> "d"' }];
    const [, entry] = buildRows(withComment, LABELS, identity, T0);
    expect(entry?.[5]).toBe('A & B <c> "d"');
  });
});

describe('exportFileName', () => {
  it('is sortable and free of locale-specific separators', () => {
    expect(exportFileName('2026-07-29')).toBe('time-entries-2026-07-29.csv');
  });
});

describe('toCsv', () => {
  const rows = () => buildRows(finished(), LABELS, identity, T0 + minutes(90));

  it('separates fields with commas and rows with CRLF', () => {
    const csv = toCsv(rows(), { commaDecimal: false });
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv.split('\r\n')[0]).toBe('Date,Start,End,Elapsed,Decimal hours,Comment,Sessions');
  });

  it('quotes a field containing the separator, so one comment cannot shift a column', () => {
    /* Comments are free text. A comment with a comma in it is exactly how a
       naive export silently corrupts every column to its right. */
    const withComma = [{ ...createEntry(T0), comment: 'Design, then build' }];
    const csv = toCsv(buildRows(withComma, LABELS, identity, T0), { commaDecimal: false });
    expect(csv).toContain('"Design, then build"');
  });

  it('doubles an embedded quote rather than ending the field', () => {
    const withQuote = [{ ...createEntry(T0), comment: 'said "hello"' }];
    const csv = toCsv(buildRows(withQuote, LABELS, identity, T0), { commaDecimal: false });
    expect(csv).toContain('"said ""hello"""');
  });

  it('quotes a field containing a line break', () => {
    const withBreak = [{ ...createEntry(T0), comment: 'one\ntwo' }];
    const csv = toCsv(buildRows(withBreak, LABELS, identity, T0), { commaDecimal: false });
    expect(csv).toContain('"one\ntwo"');
  });

  it('writes comma decimals and semicolon separators for locales that expect them', () => {
    const csv = toCsv(rows(), { commaDecimal: true });
    const [, entry] = csv.split('\r\n');
    expect(entry?.split(';')[4]).toBe('1,25');
  });

  it('leaves the clock times alone when the decimal separator is a comma', () => {
    /* "01:15:00" must not have anything done to it just because the decimal
       column next door is being rewritten. */
    const [, entry] = toCsv(rows(), { commaDecimal: true }).split('\r\n');
    expect(entry?.split(';')[3]).toBe('01:15:00');
  });
});

describe('downloadCsv', () => {
  /* jsdom implements neither object URLs nor navigation, so both are stubbed and
     the assertions are about what the browser is *asked* to do. */
  function stubDownload() {
    const created: Blob[] = [];
    const revoked: string[] = [];
    const clicked: HTMLAnchorElement[] = [];

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return 'blob:stub';
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    });

    /* Spying on the prototype rather than on `document.createElement` keeps this
       out of the way of every other element the code builds. */
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    return { created, revoked, clicked };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const csv = () =>
    toCsv(buildRows(finished(), LABELS, identity, T0 + minutes(90)), {
      commaDecimal: false,
    });

  it('offers the file under the given name', () => {
    const stub = stubDownload();
    downloadCsv(csv(), 'time-entries-2026-07-29.csv');

    expect(stub.clicked).toHaveLength(1);
    expect(stub.clicked[0]?.download).toBe('time-entries-2026-07-29.csv');
    expect(stub.clicked[0]?.href).toBe('blob:stub');
  });

  it('hands over a blob typed as UTF-8 CSV, not a bare download', () => {
    const stub = stubDownload();
    downloadCsv(csv(), 'x.csv');

    expect(stub.created).toHaveLength(1);
    expect(stub.created[0]?.type).toBe('text/csv;charset=utf-8');
    expect(stub.created[0]?.size).toBeGreaterThan(0);
  });

  it('leads with a byte-order mark, without which Excel mangles every umlaut', async () => {
    const stub = stubDownload();
    downloadCsv('Datum', 'x.csv');

    /* The *bytes*, not `text()`: decoding a blob strips a leading BOM by
       specification, so reading it back as a string can never see the thing
       this test exists to check. */
    const bytes = new Uint8Array((await stub.created[0]!.arrayBuffer()).slice(0, 3));
    expect([...bytes]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('sets rel="noopener" on the link it synthesises', () => {
    const stub = stubDownload();
    downloadCsv(csv(), 'x.csv');
    expect(stub.clicked[0]?.rel).toBe('noopener');
  });

  it('releases the object URL once the download has started', () => {
    vi.useFakeTimers();
    const stub = stubDownload();

    downloadCsv(csv(), 'x.csv');
    /* Revoking synchronously can race the browser's own fetch of the URL, so it
       is deferred by a turn of the event loop. */
    expect(stub.revoked).toEqual([]);

    vi.runAllTimers();
    expect(stub.revoked).toEqual(['blob:stub']);
  });
});
