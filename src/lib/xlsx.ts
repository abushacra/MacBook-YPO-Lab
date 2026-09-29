/**
 * A very small .xlsx writer: enough to put a few formatted sheets in a file
 * Excel, Numbers and Google Sheets all open, and nothing else.
 *
 * An .xlsx is a ZIP of XML parts. The parts here are the minimum set Excel will
 * accept, values are written as inline strings and numbers so there is no shared
 * string table to keep in step, and entries are stored uncompressed — these
 * reports are a few kilobytes, so deflating them would only add a failure mode.
 *
 * This exists instead of a spreadsheet dependency because the whole surface used
 * is four cell shapes and one sheet.
 */

export type CellStyle = "plain" | "bold" | "money" | "boldMoney" | "title";

export type Cell = { value: string | number; style?: CellStyle };

export type SheetColumn = { width: number };

/** Style ids, in the order the formats are declared in `STYLES_XML` below. */
const STYLE_IDS: Record<CellStyle, number> = {
  plain: 0,
  bold: 1,
  money: 2,
  boldMoney: 3,
  title: 4,
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel rejects most control characters outright, so they are dropped
    // rather than written and left to fail on open.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/** A1, B1 … Z1, AA1. Sheets here are far narrower than that, but the loop is free. */
function cellRef(columnIndex: number, rowNumber: number): string {
  let name = "";
  let n = columnIndex;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${name}${rowNumber}`;
}

function sheetXml(rows: Cell[][], columns: SheetColumn[]): string {
  const cols =
    columns.length > 0
      ? `<cols>${columns
          .map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1"/>`)
          .join("")}</cols>`
      : "";

  const body = rows
    .map((cells, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const written = cells
        .map((cell, columnIndex) => {
          const ref = cellRef(columnIndex, rowNumber);
          const style = cell.style ? ` s="${STYLE_IDS[cell.style]}"` : "";
          if (typeof cell.value === "number") {
            return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
          }
          if (cell.value === "") return `<c r="${ref}"${style}/>`;
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${written}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
}

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

/**
 * One relationship per sheet, then the styles. The sheets take rId1..rIdN so the
 * ids in `workbookXml` line up, and styles takes the one after.
 */
function workbookRelsXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

/**
 * Two fonts (normal, bold) and one number format, combined into the five cell
 * formats `STYLE_IDS` names. Format 164 is the money one: $#,##0.00.
 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookXml(names: string[]): string {
  const sheets = names
    .map(
      (name, i) =>
        // Excel refuses a sheet name over 31 characters, so it is cut here
        // rather than producing a file that will not open.
        `<sheet name="${xmlEscape(name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

// --- the ZIP container -------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; bytes: Uint8Array };

/** A ZIP with every entry stored uncompressed, which is all Excel needs. */
function zip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u8 = (...values: number[]) => new Uint8Array(values);
  const u16 = (value: number) => u8(value & 0xff, (value >>> 8) & 0xff);
  const u32 = (value: number) =>
    u8(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = [
      u32(0x04034b50),
      u16(20), // version needed
      u16(0), // flags
      u16(0), // stored
      u16(0), // time — fixed, so the same report twice is byte-identical
      u16(0x2921), // date — 2rd Jan 2000, an arbitrary valid DOS date
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      name,
    ];
    for (const part of local) chunks.push(part);
    chunks.push(entry.bytes);

    central.push(
      ...[
        u32(0x02014b50),
        u16(20), // version made by
        u16(20), // version needed
        u16(0),
        u16(0),
        u16(0),
        u16(0x2921),
        u32(crc),
        u32(size),
        u32(size),
        u16(name.length),
        u16(0), // extra
        u16(0), // comment
        u16(0), // disk
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset),
        name,
      ],
    );

    offset += local.reduce((total, part) => total + part.length, 0) + size;
  }

  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = [
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(offset),
    u16(0),
  ];

  const all = [...chunks, ...central, ...end];
  const out = new Uint8Array(all.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export type Sheet = { name: string; rows: Cell[][]; columns?: SheetColumn[] };

/** Builds a workbook from one or more sheets of cells. */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const text = new TextEncoder();

  return zip([
    { name: "[Content_Types].xml", bytes: text.encode(contentTypesXml(sheets.length)) },
    { name: "_rels/.rels", bytes: text.encode(ROOT_RELS_XML) },
    {
      name: "xl/workbook.xml",
      bytes: text.encode(workbookXml(sheets.map((sheet) => sheet.name))),
    },
    { name: "xl/_rels/workbook.xml.rels", bytes: text.encode(workbookRelsXml(sheets.length)) },
    { name: "xl/styles.xml", bytes: text.encode(STYLES_XML) },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      bytes: text.encode(sheetXml(sheet.rows, sheet.columns ?? [])),
    })),
  ]);
}
