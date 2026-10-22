/**
 * Triggers browser download of the binary STL file.
 */
export function downloadSTL(buffer: ArrayBuffer, filename = 'shadow-lamp.stl'): void {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Binary STL (80-byte header, uint32 count, 50 bytes per triangle) straight from an indexed
 * triangle soup, with a true facet normal per triangle. Units are whatever the positions are in (mm).
 */
export function indexedMeshToBinarySTL(positions: Float32Array, indices: Uint32Array, header = 'Shadow Lamp Generator'): ArrayBuffer {
  const T = indices.length / 3;
  const buffer = new ArrayBuffer(84 + T * 50);
  const view = new DataView(buffer);
  for (let i = 0; i < 80; i++) view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  view.setUint32(80, T, true);
  let o = 84;
  for (let t = 0; t < T; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true);
    o += 12;
    for (const v of [a, b, c]) {
      view.setFloat32(o, positions[v], true); view.setFloat32(o + 4, positions[v + 1], true); view.setFloat32(o + 8, positions[v + 2], true);
      o += 12;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buffer;
}
