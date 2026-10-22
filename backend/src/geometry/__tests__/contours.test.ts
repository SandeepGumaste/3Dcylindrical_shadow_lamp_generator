import { describe, it, expect } from 'vitest';
import { extractSmoothLoops, groupShapes, LoopIndex, signedArea } from '../contours';

function grid(width: number, height: number, open: (r: number, c: number) => boolean): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) mask[r * width + c] = open(r, c) ? 1 : 0;
  return mask;
}

describe('extractSmoothLoops', () => {
  it('traces a rectangular hole as one counter-clockwise loop with its corners untouched', () => {
    const mask = grid(20, 12, (r, c) => r >= 3 && r < 7 && c >= 5 && c < 10);
    const loops = extractSmoothLoops(mask, 20, 12);

    expect(loops).toHaveLength(1);
    expect(signedArea(loops[0])).toBeCloseTo(20, 6);
    for (const corner of [[5, 3], [10, 3], [10, 7], [5, 7]]) {
      expect(loops[0].some(([x, y]) => x === corner[0] && y === corner[1])).toBe(true);
    }
  });

  it('keeps a one-cell-wide strip as wide as it was (true corners are not rounded off)', () => {
    const mask = grid(20, 40, (r, c) => c === 8 && r >= 5 && r < 35);
    const [loop] = extractSmoothLoops(mask, 20, 40);
    expect(signedArea(loop)).toBeCloseTo(30, 6);
  });

  it('turns a staircase edge into a much flatter one, never moving a vertex more than 0.35 cell', () => {
    // Open region below a shallow ramp: the top edge rises one row every 8 columns.
    const width = 80;
    const mask = grid(width, 20, (r, c) => r >= 2 && r < 6 + Math.floor(c / 8));
    const [loop] = extractSmoothLoops(mask, width, 20);

    // Every vertex of the raw outline sits on an integer grid corner; smoothing moves the
    // stair-step corners off the grid by at most 0.35 in each axis.
    let moved = 0;
    for (const [x, y] of loop) {
      const nx = Math.abs(x - Math.round(x));
      const ny = Math.abs(y - Math.round(y));
      expect(nx).toBeLessThanOrEqual(0.35 + 1e-9);
      expect(ny).toBeLessThanOrEqual(0.35 + 1e-9);
      if (nx > 1e-9 || ny > 1e-9) moved++;
    }
    expect(moved).toBeGreaterThan(0);

    // The ramp's step height (1 row) is reduced to under half of that.
    const topEdge = loop.filter(([x, y]) => x > 12 && x < 68 && y > 8);
    const ys = topEdge.map(([, y]) => y);
    const stepsRaw = 1;
    const maxJump = Math.max(...ys.slice(1).map((y, i) => Math.abs(y - ys[i])));
    expect(maxJump).toBeLessThan(stepsRaw * 0.5);
  });

  it('keeps two open cells that only touch at a corner as separate loops with no shared vertex', () => {
    const mask = grid(12, 12, (r, c) => (r === 5 && c === 5) || (r === 6 && c === 6));
    const loops = extractSmoothLoops(mask, 12, 12);

    expect(loops).toHaveLength(2);
    const key = (p: [number, number]) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    const a = new Set(loops[0].map(key));
    expect(loops[1].some((p) => a.has(key(p)))).toBe(false);
  });

  it('never emits an edge longer than one column horizontally', () => {
    const mask = grid(60, 12, (r, c) => r >= 3 && r < 9 && c >= 5 && c < 50);
    for (const loop of extractSmoothLoops(mask, 60, 12)) {
      for (let i = 0; i < loop.length; i++) {
        const next = loop[(i + 1) % loop.length];
        expect(Math.abs(next[0] - loop[i][0])).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('groupShapes / LoopIndex', () => {
  const ring = grid(30, 30, (r, c) => {
    const d = Math.hypot(r - 15, c - 15);
    return d < 10 && d > 4;
  });

  it('groups a solid island inside an open ring with that ring, as a hole', () => {
    const shapes = groupShapes(extractSmoothLoops(ring, 30, 30));
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(1);
  });

  it('answers inside/outside with even-odd rules, so the island reads as solid', () => {
    const index = new LoopIndex(extractSmoothLoops(ring, 30, 30), 30);
    expect(index.contains(15, 15)).toBe(false); // island
    expect(index.contains(15 + 7, 15)).toBe(true); // ring
    expect(index.contains(1, 1)).toBe(false); // outside
  });
});
