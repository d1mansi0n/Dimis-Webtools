/**
 * A minimal ZIP writer.
 *
 * An `.xlsx` file is a ZIP archive of XML parts, so writing one needs an
 * archiver. Entries are stored uncompressed (method 0), which is fully valid
 * per the ZIP specification and is what keeps this to a couple of hundred lines
 * with no DEFLATE implementation. A time-tracking export is a few kilobytes of
 * XML; the bytes saved by compressing it are not worth the code.
 *
 * This exists so the Time Tracking tool has no third-party runtime dependency at
 * all. See `workbook.ts` for why that mattered.
 */

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

/** Version 2.0: the minimum that understands the flags used below. */
const VERSION_NEEDED = 20;

/** Bit 11 declares that file names are UTF-8 rather than the legacy code page. */
const FLAG_UTF8 = 0x0800;

/** Method 0 — stored, no compression. */
const METHOD_STORE = 0;

export interface ZipEntry {
  /** Path inside the archive, always with forward slashes. */
  readonly path: string;
  readonly data: Uint8Array;
}

/**
 * CRC-32 (IEEE 802.3), computed bit by bit.
 *
 * The table-driven form is faster but needs a 256-entry lookup that this never
 * runs often enough to justify. Verified against the standard test vectors in
 * the accompanying test.
 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      /* `-(crc & 1)` is 0 or 0xffffffff, applying the polynomial only when the
         low bit is set — the branchless form of the usual `if`. */
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A growable little-endian byte buffer. */
class ByteWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  get size(): number {
    return this.length;
  }

  bytes(data: Uint8Array): void {
    this.chunks.push(data);
    this.length += data.length;
  }

  u16(value: number): void {
    const buffer = new Uint8Array(2);
    new DataView(buffer.buffer).setUint16(0, value, true);
    this.bytes(buffer);
  }

  u32(value: number): void {
    const buffer = new Uint8Array(4);
    new DataView(buffer.buffer).setUint32(0, value >>> 0, true);
    this.bytes(buffer);
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

/**
 * MS-DOS date and time, as ZIP has recorded timestamps since 1989.
 *
 * Seconds have two-second resolution and years start at 1980; anything earlier
 * is clamped, since a negative year field would produce an archive that some
 * readers reject.
 */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Build a ZIP archive.
 *
 * `modified` is injectable so tests can produce byte-for-byte reproducible
 * output rather than asserting around a moving timestamp.
 */
export function createZip(entries: readonly ZipEntry[], modified: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const stamp = dosDateTime(modified);
  const out = new ByteWriter();

  const directory: {
    name: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const offset = out.size;

    out.u32(LOCAL_FILE_HEADER);
    out.u16(VERSION_NEEDED);
    out.u16(FLAG_UTF8);
    out.u16(METHOD_STORE);
    out.u16(stamp.time);
    out.u16(stamp.date);
    out.u32(crc);
    out.u32(entry.data.length); // compressed size == uncompressed size when stored
    out.u32(entry.data.length);
    out.u16(name.length);
    out.u16(0); // no extra field
    out.bytes(name);
    out.bytes(entry.data);

    directory.push({ name, crc, size: entry.data.length, offset });
  }

  const directoryOffset = out.size;
  for (const item of directory) {
    out.u32(CENTRAL_DIRECTORY_HEADER);
    out.u16(VERSION_NEEDED); // version made by
    out.u16(VERSION_NEEDED); // version needed
    out.u16(FLAG_UTF8);
    out.u16(METHOD_STORE);
    out.u16(stamp.time);
    out.u16(stamp.date);
    out.u32(item.crc);
    out.u32(item.size);
    out.u32(item.size);
    out.u16(item.name.length);
    out.u16(0); // extra field length
    out.u16(0); // comment length
    out.u16(0); // disk number
    out.u16(0); // internal attributes
    out.u32(0); // external attributes
    out.u32(item.offset);
    out.bytes(item.name);
  }
  const directorySize = out.size - directoryOffset;

  out.u32(END_OF_CENTRAL_DIRECTORY);
  out.u16(0); // this disk
  out.u16(0); // disk with the directory
  out.u16(directory.length);
  out.u16(directory.length);
  out.u32(directorySize);
  out.u32(directoryOffset);
  out.u16(0); // archive comment length

  return out.finish();
}
