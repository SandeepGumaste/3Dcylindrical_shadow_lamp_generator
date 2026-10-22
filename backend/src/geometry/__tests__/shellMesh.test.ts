import { describe, it, expect } from 'vitest';
import { MeshBuilder, buildShell } from '../shellMesh';
import { checkMesh } from '../meshCheck';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cylinderSpec(cols: number, rowsCells: number, field: Float32Array) {
  const zs = Array.from({ length: rowsCells + 1 }, (_, j) => (j * 30) / rowsCells);
  return {
    cols, zs, field,
    inner: (t: number, z: number): [number, number, number] => [20 * Math.cos(t), 20 * Math.sin(t), z],
    outer: (t: number, z: number): [number, number, number] => [21.5 * Math.cos(t), 21.5 * Math.sin(t), z],
  };
}

describe('marching-squares shell', () => {
  it('is a closed, consistently oriented manifold for random fields (incl. theta seam and borders)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      const cols = 6 + Math.floor(r() * 30);
      const rows = 3 + Math.floor(r() * 20);
      const field = new Float32Array(cols * (rows + 1));
      const smooth = r() < 0.5;
      for (let i = 0; i < field.length; i++) field[i] = (r() - 0.5) * 100;
      if (smooth) {
        // low-pass a few times so holes are blobs rather than pure noise
        for (let pass = 0; pass < 2; pass++) {
          const copy = field.slice();
          for (let j = 0; j <= rows; j++) {
            for (let i = 0; i < cols; i++) {
              const l = copy[((i + cols - 1) % cols) + cols * j];
              const rr = copy[((i + 1) % cols) + cols * j];
              field[i + cols * j] = (l + copy[i + cols * j] + rr) / 3;
            }
          }
        }
      }
      const mb = new MeshBuilder();
      buildShell(mb, cylinderSpec(cols, rows, field));
      const { positions, indices } = mb.toArrays();
      if (indices.length === 0) continue;
      const check = checkMesh(positions, indices);
      expect(check.badEdges, `seed ${seed}`).toBe(0);
      expect(check.degenerateTriangles, `seed ${seed}`).toBe(0);
      expect(check.signedVolume, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('handles a hole straddling the seam (column cols-1 to 0)', () => {
    const cols = 24, rows = 6;
    const field = new Float32Array(cols * (rows + 1)).fill(10);
    for (let j = 2; j <= 4; j++) for (const i of [cols - 2, cols - 1, 0, 1]) field[i + cols * j] = -10;
    const mb = new MeshBuilder();
    buildShell(mb, cylinderSpec(cols, rows, field));
    const { positions, indices } = mb.toArrays();
    const check = checkMesh(positions, indices);
    expect(check.watertight).toBe(true);
    expect(check.signedVolume).toBeGreaterThan(0);
  });

  it('resolves saddles consistently', () => {
    const cols = 8, rows = 4;
    const field = new Float32Array(cols * (rows + 1)).fill(5);
    // checkerboard patch -> saddle cells
    for (let j = 1; j <= 3; j++) for (let i = 1; i <= 4; i++) field[i + cols * j] = (i + j) % 2 ? -5 : 5;
    const mb = new MeshBuilder();
    buildShell(mb, cylinderSpec(cols, rows, field));
    const { positions, indices } = mb.toArrays();
    expect(checkMesh(positions, indices).watertight).toBe(true);
  });
});
