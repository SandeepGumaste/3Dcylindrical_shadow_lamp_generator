/** Reads the preview container written by the backend: [u32 JSON length][JSON][positions f32][indices u32]. */
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
