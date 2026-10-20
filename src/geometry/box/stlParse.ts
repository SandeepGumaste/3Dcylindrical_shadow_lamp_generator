export interface IndexedMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

/** Parses a binary STL into an indexed mesh, sharing vertices that have identical coordinates. */
export function parseBinaryStl(buf: ArrayBuffer): IndexedMesh {
  if (buf.byteLength < 84) throw new Error('Not a binary STL');
  const view = new DataView(buf);
  const triangles = view.getUint32(80, true);
  if (buf.byteLength < 84 + triangles * 50) throw new Error('Not a binary STL');
  const lookup = new Map<string, number>();
  const positions: number[] = [];
  const indices = new Uint32Array(triangles * 3);
  for (let t = 0; t < triangles; t++) {
    const base = 84 + t * 50 + 12;
    for (let v = 0; v < 3; v++) {
      const o = base + v * 12;
      const x = view.getFloat32(o, true), y = view.getFloat32(o + 4, true), z = view.getFloat32(o + 8, true);
      const key = `${x},${y},${z}`;
      let id = lookup.get(key);
      if (id === undefined) { id = positions.length / 3; lookup.set(key, id); positions.push(x, y, z); }
      indices[t * 3 + v] = id;
    }
  }
  return { positions: new Float32Array(positions), indices };
}

/** Rigid move so the mesh's minimum corner sits at the origin. The shape is unchanged. */
export function moveToOrigin(m: IndexedMesh): IndexedMesh {
  const p = m.positions;
  const mn = [Infinity, Infinity, Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) mn[k] = Math.min(mn[k], p[i + k]);
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) out[i + k] = p[i + k] - mn[k];
  return { positions: out, indices: m.indices };
}
