import { describe, it, expect } from 'vitest';
import { labelComponents } from '../../tealightShade';
import { bridgeFloatingPieces } from '../bridge';

const C = 100, ROWS = 41, FOOT = 3, CELL = 0.4, W = 0.8, REACH = 32;
const zs = Float64Array.from({ length: ROWS }, (_, j) => j);
function make(): Float32Array {
  const f = new Float32Array(C * ROWS).fill(-255);
  for (let j = 0; j < FOOT; j++) for (let i = 0; i < C; i++) f[i + C * j] = 255;
  return f;
}
const put = (f: Float32Array, cols: number[], rows: number[]) => { for (const j of rows) for (const i of cols) f[((i % C) + C) % C + C * j] = 255; };
const run = (f: Float32Array) => bridgeFloatingPieces(f, C, zs, FOOT, CELL, W, REACH);
/** True when every solid node is connected (periodic in u) to the foot. */
function anchored(f: Float32Array): boolean {
  const mask = new Uint8Array(f.length);
  for (let n = 0; n < f.length; n++) mask[n] = f[n] > 0 ? 1 : 0;
  const { labels, count } = labelComponents(mask, C, ROWS, 1);
  expect(count).toBe(1);
  return labels[0] >= 0;
}

describe('bridgeFloatingPieces', () => {
  it('a floating blob near the foot gets one bridge and stays', () => {
    const f = make();
    put(f, [48, 49, 50, 51], [10, 11, 12, 13]);
    expect(run(f)).toEqual({ bridged: 1, dropped: 0 });
    expect(anchored(f)).toBe(true);
    expect(f[50 + C * 12] > 0 && f[50 + C * 5] > 0 || f[49 + C * 5] > 0 || f[51 + C * 5] > 0).toBe(true);
  });
  it('the bridge is at least the print width wide', () => {
    const f = make();
    put(f, [50], [10]);
    run(f);
    let width = 0;
    for (let i = 0; i < C; i++) if (f[i + C * 6] > 0) width++;
    expect(width * CELL).toBeGreaterThanOrEqual(W);
  });
  it('two nested floating pieces chain through each other', () => {
    const f = make();
    put(f, [40, 41, 42], [14, 15]);    // 11 mm above the foot
    put(f, [40, 41, 42], [40]);        // 25 mm above the first piece, 37 mm above the foot: out of the foot's reach
    expect(run(f)).toEqual({ bridged: 2, dropped: 0 });
    expect(anchored(f)).toBe(true);
  });
  it('a piece with nothing in reach is dropped and counted', () => {
    const f = make();
    put(f, [30, 31], [40]);            // 37 mm above the foot, nothing else near
    expect(run(f)).toEqual({ bridged: 0, dropped: 1 });
    expect(f.every((v, n) => (n < C * FOOT ? v > 0 : v <= 0))).toBe(true);
  });
  it('a piece straddling the wrap seam is bridged as one piece', () => {
    const f = make();
    put(f, [97, 98, 99, 0, 1, 2], [10, 11]);
    expect(run(f)).toEqual({ bridged: 1, dropped: 0 });
    expect(anchored(f)).toBe(true);
  });
  it('a bridge can run across the seam to an attached piece', () => {
    const f = make();
    put(f, [97, 98, 99, 0], [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]); // attached column across the seam
    put(f, [8, 9], [12]);              // 8 columns away across the seam = 3.2 mm; foot is 9 rows (9 mm) below
    expect(run(f)).toEqual({ bridged: 1, dropped: 0 });
    expect(anchored(f)).toBe(true);
  });
  it('the shortest path wins: a close attached piece beats the far foot', () => {
    const f = make();
    put(f, [50, 51], [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]); // attached column
    put(f, [56, 57], [20]);            // 2.4 mm from the column, 17 mm from the foot
    run(f);
    expect(f[54 + C * 20] > 0 || f[53 + C * 20] > 0).toBe(true);
    expect(f[56 + C * 10] > 0).toBe(false); // nothing was laid down toward the foot
  });
});
