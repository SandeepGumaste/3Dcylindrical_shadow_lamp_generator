import { describe, it, expect } from 'vitest';
import { indexedMeshToBinarySTL } from '../stl';

describe('indexedMeshToBinarySTL', () => {
  it('writes header, count, and unit facet normals', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const buf = indexedMeshToBinarySTL(positions, new Uint32Array([0, 1, 2]));
    expect(buf.byteLength).toBe(84 + 50);
    const v = new DataView(buf);
    expect(v.getUint32(80, true)).toBe(1);
    expect([v.getFloat32(84, true), v.getFloat32(88, true), v.getFloat32(92, true)]).toEqual([0, 0, 1]);
    expect(v.getFloat32(96 + 12, true)).toBe(1); // second vertex x
  });
});
