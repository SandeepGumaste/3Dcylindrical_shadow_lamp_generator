import { describe, expect, it } from 'vitest';
import { traceShapes, simplifyClosed } from '../outline';

/** mask rows given as strings of '#' (hole) and '.', unit cells. */
function trace(rows: string[], tol = 0) {
  const R = rows.length, C = rows[0].length;
  const mask = new Uint8Array(C * R);
  rows.forEach((r, j) => [...r].forEach((ch, i) => { mask[i + C * j] = ch === '#' ? 1 : 0; }));
  const xs = Array.from({ length: C + 1 }, (_, i) => i);
  const ys = Array.from({ length: R + 1 }, (_, j) => j);
  return traceShapes(mask, C, R, xs, ys, tol);
}

describe('traceShapes', () => {
  it('turns a block of cells into one rectangle outline', () => {
    const s = trace(['.....', '.###.', '.###.', '.....']);
    expect(s).toHaveLength(1);
    expect(s[0].outer).toHaveLength(4);
    expect(s[0].holes).toHaveLength(0);
  });
  it('turns an L shape into one 6-point outline', () => {
    const s = trace(['##..', '##..', '####', '####']);
    expect(s).toHaveLength(1);
    expect(s[0].outer).toHaveLength(6);
  });
  it('keeps a ring as one shape with one inner hole', () => {
    const s = trace(['#####', '#...#', '#...#', '#####']);
    expect(s).toHaveLength(1);
    expect(s[0].outer).toHaveLength(4);
    expect(s[0].holes).toHaveLength(1);
    expect(s[0].holes[0]).toHaveLength(4);
  });
  it('puts an island inside a ring hole in its own shape', () => {
    const s = trace(['#######', '#.....#', '#..#..#', '#.....#', '#######']);
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.holes.length).sort()).toEqual([0, 1]);
  });
  it('separates cells that only touch at a corner', () => {
    expect(trace(['#.', '.#'])).toHaveLength(2);
  });
  it('merges a staircase edge into few segments when simplifying', () => {
    const rows = ['#.......', '##......', '###.....', '####....', '#####...', '######..', '#######.', '########'];
    const raw = trace(rows, 0)[0].outer.length;
    const simple = trace(rows, 0.8)[0].outer.length;
    expect(raw).toBeGreaterThan(10);
    expect(simple).toBeLessThanOrEqual(4);
  });
  it('never drops a shape below three points', () => {
    expect(trace(['.#.'], 5)[0].outer.length).toBeGreaterThanOrEqual(3);
  });
  it('honours uneven row heights and column positions', () => {
    const mask = Uint8Array.of(1, 1);
    const s = traceShapes(mask, 1, 2, [0, 2], [0, 1, 4], 0);
    const xs = s[0].outer.map((p) => p[0]), ys = s[0].outer.map((p) => p[1]);
    expect(Math.max(...xs)).toBe(2);
    expect(Math.max(...ys)).toBe(4);
  });
});

describe('simplifyClosed', () => {
  it('removes points within the tolerance of the chord', () => {
    const pts: [number, number][] = [[0, 0], [5, 0.1], [10, 0], [10, 10], [0, 10]];
    expect(simplifyClosed(pts, 0.5)).toHaveLength(4);
  });
});
