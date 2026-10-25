import { describe, it, expect } from 'vitest';
import { MeshBuilder, buildShell } from '../shellMesh';
import { checkMesh } from '../meshCheck';

const zs = [0, 1, 2, 3];
const flat = (cols: number, hole?: [number, number]) => {
  const f = new Float32Array(cols * zs.length).fill(1);
  if (hole) f[hole[0] + cols * hole[1]] = -1;
  return f;
};
const build = (field: Float32Array, cols: number, wrap?: boolean) => {
  const mb = new MeshBuilder();
  buildShell(mb, {
    cols, zs, field,
    inner: (th, z) => [th, 0, z],
    outer: (th, z) => [th, 0.4, z],
  }, wrap === undefined ? {} : { wrap, dTheta: 0.1 });
  const { positions, indices } = mb.toArrays();
  return checkMesh(positions, indices);
};

describe('buildShell wrap: false', () => {
  it('closes a flat sheet with end walls and the right volume', () => {
    const c = build(flat(6), 6, false);
    expect(c.watertight).toBe(true);
    // 5 cell columns of 0.1 rad on theta-as-x, 0.4 thick, 3 tall; sign depends on map orientation
    expect(Math.abs(c.signedVolume)).toBeGreaterThan(0.99 * 5 * 0.1 * 0.4 * 3);
    expect(Math.abs(c.signedVolume)).toBeLessThan(1.01 * 5 * 0.1 * 0.4 * 3);
  });

  it('stays watertight with a hole in the middle', () => {
    expect(build(flat(6, [2, 1]), 6, false).watertight).toBe(true);
  });

  it('default wrap still builds a closed ring over all columns', () => {
    const mb = new MeshBuilder();
    const C = 8;
    buildShell(mb, {
      cols: C, zs, field: flat(C),
      inner: (th, z) => [Math.cos(th), Math.sin(th), z],
      outer: (th, z) => [1.4 * Math.cos(th), 1.4 * Math.sin(th), z],
    }, { skipTopBorder: false });
    const { positions, indices } = mb.toArrays();
    expect(checkMesh(positions, indices).watertight).toBe(true);
  });
});
