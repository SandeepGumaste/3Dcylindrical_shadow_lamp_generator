import { describe, expect, it } from 'vitest';
import { contourShapes, simplifyClosed, smoothPath } from '../outline';

/** Node grid with unit spacing; value <= 0 is inside a shape. */
function grid(cols: number, rows: number, f: (x: number, y: number) => number) {
  const v = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) v[i + cols * j] = f(i, j);
  const xs = Array.from({ length: cols }, (_, i) => i);
  const ys = Array.from({ length: rows }, (_, j) => j);
  return { v, cols, rows, xs, ys };
}
const shapes = (g: ReturnType<typeof grid>) => contourShapes(g.v, g.cols, g.rows, g.xs, g.ys);

describe('contourShapes', () => {
  it('traces a round blob to sub-cell accuracy', () => {
    const g = grid(21, 21, (x, y) => Math.hypot(x - 10, y - 10) - 6.3);
    const s = shapes(g);
    expect(s).toHaveLength(1);
    expect(s[0].holes).toHaveLength(0);
    for (const [x, y] of s[0].outer) expect(Math.abs(Math.hypot(x - 10, y - 10) - 6.3)).toBeLessThan(0.1);
  });
  it('keeps a ring as one shape with one inner loop', () => {
    const g = grid(31, 31, (x, y) => { const r = Math.hypot(x - 15, y - 15); return Math.max(r - 10.3, 5.3 - r); });
    const s = shapes(g);
    expect(s).toHaveLength(1);
    expect(s[0].holes).toHaveLength(1);
  });
  it('puts an island inside a ring hole in its own shape', () => {
    const g = grid(41, 41, (x, y) => {
      const r = Math.hypot(x - 20, y - 20);
      return Math.min(Math.max(r - 18.3, 12.3 - r), r - 4.3);
    });
    const s = shapes(g);
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.holes.length).sort()).toEqual([0, 1]);
  });
  it('keeps two separate blobs apart', () => {
    const g = grid(30, 12, (x, y) => Math.min(Math.hypot(x - 7, y - 6) - 4.3, Math.hypot(x - 22, y - 6) - 4.3));
    expect(shapes(g)).toHaveLength(2);
  });
  it('separates blobs that only meet at a saddle', () => {
    const g = grid(4, 4, (x, y) => ((x === 1 && y === 1) || (x === 2 && y === 2) ? -1 : 1));
    expect(shapes(g)).toHaveLength(2);
  });
  it('closes a shape that runs off the grid along the grid border', () => {
    const g = grid(12, 12, (x, y) => Math.hypot(x, y) - 6.3);
    const s = shapes(g);
    expect(s).toHaveLength(1);
    expect(Math.min(...s[0].outer.map((p) => p[0]))).toBeCloseTo(0, 6);
    expect(Math.min(...s[0].outer.map((p) => p[1]))).toBeCloseTo(0, 6);
  });
  it('uses uneven node positions', () => {
    const v = new Float32Array([-1, -1, -1, -1]);
    const s = contourShapes(v, 2, 2, [0, 5], [0, 2], );
    expect(Math.max(...s[0].outer.map((p) => p[0]))).toBe(5);
    expect(Math.max(...s[0].outer.map((p) => p[1]))).toBe(2);
  });
});

describe('simplifyClosed', () => {
  it('removes points within the tolerance of the chord', () => {
    const pts: [number, number][] = [[0, 0], [5, 0.1], [10, 0], [10, 10], [0, 10]];
    expect(simplifyClosed(pts, 0.5)).toHaveLength(4);
  });
  it('never returns fewer than 3 points', () => {
    expect(simplifyClosed([[0, 0], [1, 0], [0, 0.01]], 5).length).toBeGreaterThanOrEqual(3);
  });
});

describe('smoothPath', () => {
  const circle = Array.from({ length: 64 }, (_, k): [number, number] => [10 * Math.cos((2 * Math.PI * k) / 64), 10 * Math.sin((2 * Math.PI * k) / 64)]);
  const nums = (d: string) => (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
  it('draws a round shape as a few cubic curves, closed', () => {
    const d = smoothPath([circle], 0.05);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const curves = (d.match(/C/g) ?? []).length;
    expect(curves).toBeGreaterThan(3);
    expect(curves).toBeLessThan(40);
    expect(d).not.toContain('L');
  });
  it('keeps the corners of a square sharp and does not overshoot', () => {
    const sq: [number, number][] = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]];
    const d = smoothPath([sq], 0.05);
    for (const n of nums(d)) { expect(n).toBeGreaterThan(-0.01); expect(n).toBeLessThan(10.01); }
  });
  it('emits every loop of a shape as its own closed subpath', () => {
    const d = smoothPath([circle, circle.map(([x, y]): [number, number] => [x * 0.4, y * 0.4])], 0.05);
    expect((d.match(/M/g) ?? []).length).toBe(2);
    expect((d.match(/Z/g) ?? []).length).toBe(2);
  });
});
