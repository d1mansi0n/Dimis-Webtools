import { describe, expect, it } from 'vitest';
import { createZip, crc32 } from './zip.js';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/**
 * A deliberately independent ZIP reader.
 *
 * Written from the specification rather than by reusing anything in `zip.ts`,
 * so that a matching bug in both would have to be made twice.
 */
function readZip(archive: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const entries = new Map<string, Uint8Array>();

  /* Find the end-of-central-directory record by scanning back for its signature. */
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record');

  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);

  for (let index = 0; index < count; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error(`bad central directory signature at entry ${String(index)}`);
    }
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decode(archive.subarray(cursor + 46, cursor + 46 + nameLength));

    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(`bad local header signature for ${name}`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;

    const data = archive.subarray(dataStart, dataStart + compressedSize);
    const storedCrc = view.getUint32(cursor + 16, true);
    if (crc32(data) !== storedCrc) throw new Error(`CRC mismatch for ${name}`);

    entries.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

describe('crc32', () => {
  it('matches the standard test vectors', () => {
    expect(crc32(encode(''))).toBe(0x00000000);
    expect(crc32(encode('a'))).toBe(0xe8b7be43);
    expect(crc32(encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });

  it('returns an unsigned 32-bit value', () => {
    const value = crc32(encode('a'));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });

  it('is sensitive to byte order', () => {
    expect(crc32(encode('ab'))).not.toBe(crc32(encode('ba')));
  });
});

describe('createZip', () => {
  const fixedDate = new Date(2026, 6, 29, 12, 30, 0);

  it('produces an archive an independent reader can parse', () => {
    const archive = createZip(
      [
        { path: 'hello.txt', data: encode('hello') },
        { path: 'nested/dir/file.xml', data: encode('<x/>') },
      ],
      fixedDate,
    );

    const entries = readZip(archive);
    expect([...entries.keys()]).toEqual(['hello.txt', 'nested/dir/file.xml']);
    expect(decode(entries.get('hello.txt')!)).toBe('hello');
    expect(decode(entries.get('nested/dir/file.xml')!)).toBe('<x/>');
  });

  it('starts with the local file header signature', () => {
    const archive = createZip([{ path: 'a', data: encode('b') }], fixedDate);
    expect(Array.from(archive.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('writes a correct CRC for every entry, which the reader verifies', () => {
    expect(() =>
      readZip(createZip([{ path: 'a.txt', data: encode('some content') }], fixedDate)),
    ).not.toThrow();
  });

  it('handles an empty archive', () => {
    expect(readZip(createZip([], fixedDate)).size).toBe(0);
  });

  it('handles an empty file', () => {
    const entries = readZip(createZip([{ path: 'empty', data: new Uint8Array(0) }], fixedDate));
    expect(entries.get('empty')?.length).toBe(0);
  });

  it('round-trips non-ASCII file names and content as UTF-8', () => {
    const entries = readZip(
      createZip([{ path: 'Zeiteinträge.xml', data: encode('Größe: 5 €') }], fixedDate),
    );
    expect(decode(entries.get('Zeiteinträge.xml')!)).toBe('Größe: 5 €');
  });

  it('is byte-for-byte reproducible for the same input and timestamp', () => {
    const build = (): Uint8Array =>
      createZip([{ path: 'a.txt', data: encode('stable') }], fixedDate);
    expect(build()).toEqual(build());
  });

  it('clamps timestamps before 1980, which the DOS date field cannot express', () => {
    expect(() =>
      readZip(createZip([{ path: 'old', data: encode('x') }], new Date(1970, 0, 1))),
    ).not.toThrow();
  });

  it('handles data larger than a single chunk', () => {
    const big = encode('x'.repeat(200_000));
    const entries = readZip(createZip([{ path: 'big', data: big }], fixedDate));
    expect(entries.get('big')?.length).toBe(200_000);
  });
});
