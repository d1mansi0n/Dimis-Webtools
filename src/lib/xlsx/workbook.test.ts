import { describe, expect, it } from 'vitest';
import { columnName, createWorkbook, escapeXml, sanitiseSheetName } from './workbook.js';
import { crc32 } from './zip.js';

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Pull a named part out of a stored-only ZIP, by scanning local file headers. */
function readPart(archive: Uint8Array, path: string): string {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let cursor = 0;
  while (cursor + 4 <= archive.length && view.getUint32(cursor, true) === 0x04034b50) {
    const size = view.getUint32(cursor + 18, true);
    const nameLength = view.getUint16(cursor + 26, true);
    const extraLength = view.getUint16(cursor + 28, true);
    const name = decode(archive.subarray(cursor + 30, cursor + 30 + nameLength));
    const dataStart = cursor + 30 + nameLength + extraLength;
    if (name === path) return decode(archive.subarray(dataStart, dataStart + size));
    cursor = dataStart + size;
  }
  throw new Error(`part "${path}" not found in archive`);
}

const sheetOf = (archive: Uint8Array): string => readPart(archive, 'xl/worksheets/sheet1.xml');

describe('escapeXml', () => {
  it('escapes the five XML metacharacters', () => {
    expect(escapeXml('<&>"\'')).toBe('&lt;&amp;&gt;&quot;&apos;');
  });

  it('escapes the ampersand first, so entities are not double-encoded', () => {
    /* The regression test for the old escapeAttribute(), which replaced `&` last
       and turned a quotation mark into the literal text `&amp;quot;`. */
    expect(escapeXml('say "hi"')).toBe('say &quot;hi&quot;');
    expect(escapeXml('a & b')).toBe('a &amp; b');
    expect(escapeXml('&amp;')).toBe('&amp;amp;');
  });

  it('strips control characters XML cannot represent', () => {
    expect(escapeXml('a\u0000b\u0008c\u001Fd')).toBe('abcd');
  });

  it('keeps tab, newline and carriage return, which XML allows', () => {
    expect(escapeXml('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });

  it('leaves ordinary text and emoji alone', () => {
    expect(escapeXml('Kundengespräch 🎧')).toBe('Kundengespräch 🎧');
  });
});

describe('sanitiseSheetName', () => {
  it('keeps a valid name', () => {
    expect(sanitiseSheetName('Time entries')).toBe('Time entries');
  });

  it('replaces the characters Excel rejects', () => {
    expect(sanitiseSheetName('a/b\\c?d*e[f]g:h')).toBe('a b c d e f g h');
  });

  it('truncates to the 31-character limit', () => {
    expect(sanitiseSheetName('x'.repeat(50))).toHaveLength(31);
  });

  it('falls back rather than producing an empty name', () => {
    expect(sanitiseSheetName('   ')).toBe('Sheet1');
    expect(sanitiseSheetName('///')).toBe('Sheet1');
  });
});

describe('columnName', () => {
  it.each([
    [0, 'A'],
    [1, 'B'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [51, 'AZ'],
    [52, 'BA'],
    [701, 'ZZ'],
    [702, 'AAA'],
  ])('maps %i to %s', (index, expected) => {
    expect(columnName(index)).toBe(expected);
  });
});

describe('createWorkbook', () => {
  const fixedDate = new Date(2026, 6, 29, 12, 0, 0);

  const simple = (): Uint8Array =>
    createWorkbook(
      {
        name: 'Time entries',
        rows: [
          ['Date', 'Comment', 'Decimal hours'],
          ['2026-07-29', 'Client call', 1.25],
        ],
        columns: [{ width: 12 }, { width: 40 }, { width: 15 }],
        decimalColumns: [2],
      },
      fixedDate,
    );

  it('contains every part the format requires', () => {
    const archive = simple();
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]) {
      expect(() => readPart(archive, part), part).not.toThrow();
    }
  });

  it('writes a valid ZIP container', () => {
    const archive = simple();
    expect(Array.from(archive.subarray(0, 2))).toEqual([0x50, 0x4b]);
    expect(crc32(archive)).toBeGreaterThanOrEqual(0);
  });

  it('writes numbers as numbers so a spreadsheet can sum them', () => {
    expect(sheetOf(simple())).toContain('<v>1.25</v>');
  });

  it('writes text as inline strings', () => {
    expect(sheetOf(simple())).toContain('<t xml:space="preserve">Client call</t>');
  });

  it('applies the decimal format only to the nominated column', () => {
    const xml = sheetOf(simple());
    expect(xml).toMatch(/<c r="C2" s="2"><v>1\.25<\/v><\/c>/);
  });

  it('marks the header row bold', () => {
    expect(sheetOf(simple())).toMatch(/<c r="A1" s="1"/);
  });

  it('emits the requested column widths', () => {
    expect(sheetOf(simple())).toContain('<col min="2" max="2" width="40" customWidth="1"/>');
  });

  it('numbers rows and columns from A1', () => {
    const xml = sheetOf(simple());
    expect(xml).toContain('r="A1"');
    expect(xml).toContain('r="C2"');
  });

  describe('untrusted cell text', () => {
    const withComment = (comment: string): string =>
      sheetOf(createWorkbook({ name: 'S', rows: [['Comment'], [comment]] }, fixedDate));

    it('cannot break out of the cell element', () => {
      const xml = withComment('</t></is></c><c r="ZZ9"><v>666</v></c>');
      expect(xml).not.toContain('<c r="ZZ9">');
      expect(xml).toContain('&lt;/t&gt;');
    });

    it('cannot inject an XML entity', () => {
      expect(withComment('&lt;script&gt;')).toContain('&amp;lt;script&amp;gt;');
    });

    it('keeps a leading equals sign as text, not a formula', () => {
      /* Written as an inline string, so Excel displays it rather than evaluating
         it — the reason the CSV fallback was dropped. */
      const xml = withComment('=1+1');
      expect(xml).toContain('t="inlineStr"');
      expect(xml).toContain('<t xml:space="preserve">=1+1</t>');
    });

    it('survives a comment made entirely of control characters', () => {
      expect(() => withComment('\u0000\u0001\u0002')).not.toThrow();
    });
  });

  it('writes an empty cell for a blank string', () => {
    const xml = sheetOf(createWorkbook({ name: 'S', rows: [['H'], ['']] }, fixedDate));
    expect(xml).toContain('<c r="A2"/>');
  });

  it('writes an empty cell rather than invalid XML for a non-finite number', () => {
    const xml = sheetOf(createWorkbook({ name: 'S', rows: [['H'], [NaN]] }, fixedDate));
    expect(xml).not.toContain('NaN');
  });

  it('sanitises the sheet name it writes into the workbook part', () => {
    const archive = createWorkbook({ name: 'a/b', rows: [['x']] }, fixedDate);
    expect(readPart(archive, 'xl/workbook.xml')).toContain('name="a b"');
  });

  it('handles a workbook with only a header row', () => {
    expect(() => createWorkbook({ name: 'S', rows: [['only']] }, fixedDate)).not.toThrow();
  });

  it('handles ragged rows', () => {
    const xml = sheetOf(createWorkbook({ name: 'S', rows: [['a', 'b', 'c'], ['d']] }, fixedDate));
    expect(xml).toContain('r="A2"');
    expect(xml).not.toContain('r="B2"');
  });

  it('is reproducible for a fixed timestamp', () => {
    expect(simple()).toEqual(simple());
  });

  it('emits well-formed XML in every part', () => {
    /* Checked with a real XML parser rather than by pattern matching, because a
       stray unescaped character produces a file Excel refuses to open at all. */
    const archive = createWorkbook(
      {
        name: 'Time entries',
        rows: [
          ['Date', 'Comment'],
          ['2026-07-29', 'Quotes " & angles <> and an emoji 🎧'],
        ],
      },
      fixedDate,
    );

    const parser = new DOMParser();
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]) {
      const document_ = parser.parseFromString(readPart(archive, part), 'application/xml');
      expect(document_.querySelector('parsererror'), `${part} is not well-formed`).toBeNull();
    }
  });
});
