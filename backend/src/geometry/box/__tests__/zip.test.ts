import { describe, it, expect } from 'vitest';
import { makeZip } from '../zip';

const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o, true);
const u16 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint16(o, true);

describe('store-only zip', () => {
  it('round-trips names, sizes and CRC-32 values', () => {
    const enc = new TextEncoder();
    const zip = makeZip([{ name: 'a.txt', data: enc.encode('hello') }, { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3, 4, 5, 6]) }]);
    // end of central directory
    const eocd = zip.length - 22;
    expect(u32(zip, eocd)).toBe(0x06054b50);
    expect(u16(zip, eocd + 10)).toBe(2);
    // local header of the first entry
    expect(u32(zip, 0)).toBe(0x04034b50);
    expect(u32(zip, 14)).toBe(0x3610a686); // CRC-32 of "hello"
    expect(u32(zip, 18)).toBe(5); expect(u32(zip, 22)).toBe(5);
    const nameLen = u16(zip, 26);
    expect(new TextDecoder().decode(zip.slice(30, 30 + nameLen))).toBe('a.txt');
    expect(new TextDecoder().decode(zip.slice(30 + nameLen, 30 + nameLen + 5))).toBe('hello');
    // central directory points back at the local headers
    const cd = u32(zip, eocd + 16);
    expect(u32(zip, cd)).toBe(0x02014b50);
    expect(u32(zip, cd + 42)).toBe(0);
  });
});
