/** Minimal store-only (uncompressed) zip writer; STL files do not compress much and this needs no library. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const names = entries.map((e) => enc.encode(e.name));
  const local = entries.reduce((n, e, i) => n + 30 + names[i].length + e.data.length, 0);
  const central = names.reduce((n, nm) => n + 46 + nm.length, 0);
  const out = new Uint8Array(local + central + 22);
  const dv = new DataView(out.buffer);
  const offsets: number[] = [];
  let o = 0;
  entries.forEach((e, i) => {
    offsets.push(o);
    dv.setUint32(o, 0x04034b50, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 0x0800, true); // UTF-8 names
    dv.setUint16(o + 8, 0, true); dv.setUint16(o + 10, 0, true); dv.setUint16(o + 12, 0x21, true); // stored, 1980-01-01
    dv.setUint32(o + 14, crc32(e.data), true); dv.setUint32(o + 18, e.data.length, true); dv.setUint32(o + 22, e.data.length, true);
    dv.setUint16(o + 26, names[i].length, true); dv.setUint16(o + 28, 0, true);
    out.set(names[i], o + 30); out.set(e.data, o + 30 + names[i].length);
    o += 30 + names[i].length + e.data.length;
  });
  const cdStart = o;
  entries.forEach((e, i) => {
    dv.setUint32(o, 0x02014b50, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 20, true); dv.setUint16(o + 8, 0x0800, true);
    dv.setUint16(o + 10, 0, true); dv.setUint16(o + 12, 0, true); dv.setUint16(o + 14, 0x21, true);
    dv.setUint32(o + 16, crc32(e.data), true); dv.setUint32(o + 20, e.data.length, true); dv.setUint32(o + 24, e.data.length, true);
    dv.setUint16(o + 28, names[i].length, true); dv.setUint32(o + 42, offsets[i], true);
    out.set(names[i], o + 46);
    o += 46 + names[i].length;
  });
  dv.setUint32(o, 0x06054b50, true); dv.setUint16(o + 8, entries.length, true); dv.setUint16(o + 10, entries.length, true);
  dv.setUint32(o + 12, o - cdStart, true); dv.setUint32(o + 16, cdStart, true);
  return out;
}
