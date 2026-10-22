/**
 * Binary container for a preview: [u32 LE JSON byte length][JSON, space-padded to a multiple of 4][positions f32][indices u32].
 * `meta` gains `positionsBytes` and `indicesBytes`.
 */
export function frameResponse(meta: object, positions: Float32Array, indices: Uint32Array): ArrayBuffer {
  const full = { ...meta, positionsBytes: positions.byteLength, indicesBytes: indices.byteLength };
  let json = new TextEncoder().encode(JSON.stringify(full));
  const padded = Math.ceil(json.length / 4) * 4;
  if (padded !== json.length) {
    const p = new Uint8Array(padded).fill(0x20);
    p.set(json);
    json = p;
  }
  const out = new ArrayBuffer(4 + json.length + positions.byteLength + indices.byteLength);
  new DataView(out).setUint32(0, json.length, true);
  new Uint8Array(out, 4, json.length).set(json);
  new Float32Array(out, 4 + json.length, positions.length).set(positions);
  new Uint32Array(out, 4 + json.length + positions.byteLength, indices.length).set(indices);
  return out;
}

export function unframeResponse(buf: ArrayBuffer): { meta: any; positions: Float32Array; indices: Uint32Array } {
  if (buf.byteLength < 4) throw new Error('Malformed response');
  const jsonLength = new DataView(buf).getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jsonLength)));
  const p0 = 4 + jsonLength;
  const i0 = p0 + meta.positionsBytes;
  if (i0 + meta.indicesBytes !== buf.byteLength) throw new Error('Malformed response');
  return {
    meta,
    positions: new Float32Array(buf, p0, meta.positionsBytes / 4),
    indices: new Uint32Array(buf, i0, meta.indicesBytes / 4),
  };
}
