import { describe, it, expect } from 'vitest';
import { DEFAULT_BOWL_PARAMS, BowlParams, rimHeight, silhouetteRadii, generateShadowBowl, validateBowlParams } from '../shadowBowl';
import type { GrayImage } from '../../types';

const P = (o: Partial<BowlParams> = {}): BowlParams => ({ ...DEFAULT_BOWL_PARAMS, ...o });

// dark disc of radius `frac` (fraction of the shadow disk) centred in the image
function disc(frac: number, n = 400): GrayImage {
  const pixels = new Float32Array(n * n).fill(1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = ((x + 0.5) / n - 0.5) * 2, dy = ((y + 0.5) / n - 0.5) * 2;
    if (Math.hypot(dx, dy) < frac) pixels[y * n + x] = 0;
  }
  return { width: n, height: n, pixels };
}

describe('shadow bowl', () => {
  it('h(theta) follows hLED * (1 - R / rs)', () => {
    expect(rimHeight(30, 47, 80, 8)).toBeCloseTo(30 * (1 - 47 / 80), 9);
    expect(rimHeight(30, 47, 100, 8)).toBeCloseTo(30 * (1 - 47 / 100), 9);
  });

  it('respects clamps: min rim, hLED - 1, and rs <= R', () => {
    expect(rimHeight(30, 47, 47, 8)).toBe(8);
    expect(rimHeight(30, 47, 20, 8)).toBe(8);
    expect(rimHeight(30, 47, 48, 8)).toBe(8);          // formula gives 0.6 -> raised to min
    expect(rimHeight(30, 47, 1e9, 8)).toBe(29);        // formula -> 30 -> capped at hLED - 1
  });

  it('measures the silhouette radius of a disc', () => {
    const p = P();
    const rs = silhouetteRadii(disc(0.6), p);
    for (const r of [rs[0], rs[100], rs[333]]) expect(Math.abs(r - 0.6 * p.shadowRadius)).toBeLessThan(1.5);
  });

  it('generates a watertight bowl whose rim matches the formula', () => {
    const p = P({ rimSmoothing: 0 });
    const res = generateShadowBowl(disc(0.6), p);
    expect(res.report.check.errors).toEqual([]);
    expect(res.report.check.signedVolume).toBeGreaterThan(0);
    const Rout = p.bowlDiameter / 2 + p.wallThickness;
    const expected = rimHeight(p.ledHeight, Rout, 0.6 * p.shadowRadius, p.minRim);
    expect(res.rimHeights[10]).toBeCloseTo(expected, 0);
    for (const h of res.rimHeights) { expect(h).toBeGreaterThanOrEqual(p.minRim - 1e-6); expect(h).toBeLessThanOrEqual(p.ledHeight - 1 + 1e-6); }
  });

  it('smoothing removes spikes but keeps clamps', () => {
    const p = P({ rimSmoothing: 4 });
    const n = 400;
    const img = disc(0.6, n);
    for (let y = 0; y < 20; y++) for (let x = 195; x < 205; x++) img.pixels[y * n + x] = 0; // thin spike to the top edge
    const res = generateShadowBowl(img, p);
    let maxStep = 0;
    for (let i = 0; i < res.rimHeights.length; i++) maxStep = Math.max(maxStep, Math.abs(res.rimHeights[i] - res.rimHeights[(i + 1) % res.rimHeights.length]));
    expect(maxStep).toBeLessThan(2);
    expect(res.report.check.watertight).toBe(true);
  });

  it('validates inputs', () => {
    expect(validateBowlParams(P({ bowlDiameter: 40 })).length).toBeGreaterThan(0);
    expect(validateBowlParams(P())).toEqual([]);
  });
});
