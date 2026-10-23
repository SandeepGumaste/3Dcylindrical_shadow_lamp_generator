import { describe, it, expect } from 'vitest';
import type { GrayImage } from '../../../types';
import { DEFAULT_SHADOW_WALL_PARAMS, generateShadowWall } from '../shadowWall';

const N = 256;

/** Dark everywhere except a white window on the +x side: its far edge is a roof over open wall. */
function window(): GrayImage {
  const img: GrayImage = { width: N, height: N, pixels: new Float32Array(N * N).fill(0) };
  const k = 400 / N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const X = (x + 0.5 - N / 2) * k, Y = -(y + 0.5 - N / 2) * k;
    if (X > 60 && X < 140 && Math.abs(Y) < 40) img.pixels[y * N + x] = 1;
  }
  return img;
}

describe('snappable supports', () => {
  const p = { ...DEFAULT_SHADOW_WALL_PARAMS };
  const plain = generateShadowWall(window(), p);
  const withSupports = generateShadowWall(window(), { ...p, supports: true });

  it('adds nothing when off', () => {
    expect(plain.supportIndexStart).toBe(plain.indices.length);
    expect(plain.report.supports.count).toBe(0);
  });

  it('adds pillars after the model proper, leaving the model unchanged', () => {
    expect(withSupports.report.supports.count).toBeGreaterThan(0);
    expect(withSupports.supportIndexStart).toBe(plain.indices.length);
    expect(withSupports.indices.length).toBeGreaterThan(plain.indices.length);
    let same = true;
    for (let t = 0; t < plain.indices.length && same; t++) same = withSupports.indices[t] === plain.indices[t];
    expect(same).toBe(true);
  });

  it('stays a closed mesh with positive volume', () => {
    expect(withSupports.report.check.errors).toEqual([]);
    expect(withSupports.report.check.watertight).toBe(true);
    expect(withSupports.report.check.signedVolume).toBeGreaterThan(plain.report.check.signedVolume);
  });

  it('keeps every pillar inside the wall footprint and height', () => {
    let top = -Infinity;
    for (let v = 2; v < withSupports.positions.length; v += 3) top = Math.max(top, withSupports.positions[v]);
    expect(top).toBeLessThanOrEqual(p.height + p.baseThickness + 1e-3);
  });
});
