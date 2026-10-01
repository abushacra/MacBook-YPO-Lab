/**
 * A minimal ZIP writer.
 *
 * Every entry is stored uncompressed, which is all Excel needs for an .xlsx and
 * all a bundle of receipts needs either — these files are small, and deflating
 * them would only add a failure mode. Written here rather than pulled in because
 * the whole surface used is "put these bytes in a file".
 */

export type ZipEntry = { name: string; bytes: Uint8Array };

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

/** A ZIP with every entry stored uncompressed. */
export function zip(entries: ZipEntry[]): Uint8Array {
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

