/**
 * A minimal `.xlsx` writer.
 *
 * ### Why this is hand-written
 *
 * The 1.0 and 2.0 time trackers pulled SheetJS in from a CDN:
 *
 * ```html
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
 * ```
 *
 * with no Subresource Integrity hash and no Content Security Policy. That is a
 * script from a third-party origin, unpinned by content, granted the same
 * authority as the page itself. Version 0.18.5 also carries published advisories
 * (prototype pollution, and a regular-expression denial of service), and the
 * fixed releases are not on the public npm registry.
 *
 * The tool needs a header row, some strings, some numbers and sensible column
 * widths. That is what this produces — a few hundred lines of XML in a ZIP, with
 * no supply chain to audit and no network fetch that can fail offline.
 *
 * ### On formula injection
 *
 * Every text cell is written as `t="inlineStr"`, which Excel treats as literal
 * text. A comment beginning `=cmd|…` is therefore displayed, not evaluated. This
 * matters because comments are free text the user dictates or types, and the
 * export is a file they are likely to open in a trusted application. (This is
 * also the reason the CSV fallback the 2.0 tool used was dropped: CSV has no way
 * to mark a field as text, so the same string would have been live there.)
 */

import { createZip, type ZipEntry } from './zip.js';

/** A single cell. Numbers are written as numbers so spreadsheets can sum them. */
export type CellValue = string | number;

export interface Column {
  /** Width in characters, matching Excel's own unit. */
  readonly width: number;
}

export interface Sheet {
  /** Sheet name as shown on the tab. */
  readonly name: string;
  /** Row-major cell values. The first row is styled as a header. */
  readonly rows: readonly (readonly CellValue[])[];
  readonly columns?: readonly Column[];
  /**
   * Zero-based indices of columns to format with two decimal places. Used for
   * the decimal-hours column, which is otherwise displayed at full precision.
   */
  readonly decimalColumns?: readonly number[];
}

/* ------------------------------------------------------------------- escaping */

/**
 * XML 1.0 forbids most control characters outright — they cannot be escaped,
 * only removed. Tab, newline and carriage return are the exceptions.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const FORBIDDEN_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Escape text for an XML text node or attribute value.
 *
 * The order matters: `&` is replaced *first*, so the ampersands introduced by
 * the later replacements are not escaped a second time. Getting this backwards
 * is exactly the bug the old `escapeAttribute()` had — it replaced `&` last and
 * turned every `"` into a literal `&amp;quot;`.
 */
export function escapeXml(value: string): string {
  return value
    .replace(FORBIDDEN_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sanitise a sheet name.
 *
 * Excel rejects a workbook whose sheet name contains `: \ / ? * [ ]`, exceeds 31
 * characters, or is empty — a hard "unreadable content" error rather than a
 * warning, so the name is corrected here instead of trusting the caller.
 */
export function sanitiseSheetName(name: string): string {
  const cleaned = name
    .replace(/[:\\/?*[\]]/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned === '' ? 'Sheet1' : cleaned;
}

/* ------------------------------------------------------------- XML generation */

/** Spreadsheet column reference: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  let remaining = index;
  while (remaining >= 0) {
    name = String.fromCharCode(65 + (remaining % 26)) + name;
    remaining = Math.floor(remaining / 26) - 1;
  }
  return name;
}

/* Style indices defined in `stylesXml()` below. */
const STYLE_DEFAULT = 0;
const STYLE_HEADER = 1;
const STYLE_DECIMAL = 2;

function cellXml(value: CellValue, reference: string, style: number): string {
  const styleAttr = style === STYLE_DEFAULT ? '' : ` s="${String(style)}"`;

  if (typeof value === 'number') {
    /* Non-finite numbers have no representation in the file format; writing them
       as empty is better than writing something a reader will reject. */
    if (!Number.isFinite(value)) return `<c r="${reference}"${styleAttr}/>`;
    return `<c r="${reference}"${styleAttr}><v>${String(value)}</v></c>`;
  }

  if (value === '') return `<c r="${reference}"${styleAttr}/>`;

  /* `xml:space="preserve"` keeps leading and trailing spaces, which Excel would
     otherwise strip from a comment. */
  return `<c r="${reference}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const decimalColumns = new Set(sheet.decimalColumns ?? []);

  const columns =
    sheet.columns === undefined || sheet.columns.length === 0
      ? ''
      : `<cols>${sheet.columns
          .map(
            (column, index) =>
              `<col min="${String(index + 1)}" max="${String(index + 1)}" width="${String(
                column.width,
              )}" customWidth="1"/>`,
          )
          .join('')}</cols>`;

  const rows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const style =
            rowIndex === 0
              ? STYLE_HEADER
              : decimalColumns.has(columnIndex) && typeof value === 'number'
                ? STYLE_DECIMAL
                : STYLE_DEFAULT;
          return cellXml(value, `${columnName(columnIndex)}${String(rowIndex + 1)}`, style);
        })
        .join('');
      return `<row r="${String(rowIndex + 1)}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${columns}<sheetData>${rows}</sheetData></worksheet>`;
}

/**
 * Style table.
 *
 * Excel requires the first two fills to be `none` and `gray125` in that order —
 * a documented quirk of the format rather than a choice. Beyond that there are
 * three cell formats: default, bold (for the header row) and `0.00`.
 */
function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function workbookRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

/* ---------------------------------------------------------------- entry point */

/** Build a single-sheet `.xlsx` workbook. */
export function createWorkbook(sheet: Sheet, modified?: Date): Uint8Array {
  const encoder = new TextEncoder();
  const name = sanitiseSheetName(sheet.name);

  const parts: ZipEntry[] = [
    { path: '[Content_Types].xml', data: encoder.encode(contentTypesXml()) },
    { path: '_rels/.rels', data: encoder.encode(rootRelsXml()) },
    { path: 'xl/workbook.xml', data: encoder.encode(workbookXml(name)) },
    { path: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml()) },
    { path: 'xl/styles.xml', data: encoder.encode(stylesXml()) },
    { path: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml(sheet)) },
  ];

  return createZip(parts, modified);
}

/** The MIME type browsers expect for an `.xlsx` download. */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
