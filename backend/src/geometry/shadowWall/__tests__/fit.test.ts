import { describe, it, expect } from 'vitest';
import type { GrayImage } from '../../../types';
import { DEFAULT_SHADOW_WALL_PARAMS, ShadowWallParams, fitShadowSize, generateShadowWall, buildField, groundDrop } from '../shadowWall';

const P: ShadowWallParams = { ...DEFAULT_SHADOW_WALL_PARAMS, edgeRounding: 0, minFeature: 0 };
const N = 256;
const K = 400 / N; // mm per pixel at shadowSize 400

/** White image with a dark rectangle |x| < hx, |y| < hy (mm on a 400 mm canvas): a wide, Batman-like blob. */
function blob(hx: number, hy: number): GrayImage {
  const pixels = new Float32Array(N * N).fill(1);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const X = (x + 0.5 - N / 2) * K, Y = -(y + 0.5 - N / 2) * K;
    if (Math.abs(X) < hx && Math.abs(Y) < hy) pixels[y * N + x] = 0;
  }
  return { width: N, height: N, pixels };
}
const reachWarning = (img: GrayImage, p: ShadowWallParams) =>
  generateShadowWall(img, p, false).report.warnings.some((w) => /beyond the wall's reach/.test(w));

describe('fitShadowSize', () => {
  const wide = blob(190, 50); // reaches 190 mm along x, the wall reaches 174.6 mm there
  it('shrinks until the reach warning disappears, in 5 mm steps, never above the current size', () => {
    expect(reachWarning(wide, P)).toBe(true);
    const fit = fitShadowSize(wide, P);
    expect(fit.ok).toBe(true);
    expect(fit.shadowSize).toBeLessThan(P.shadowSize);
    expect(fit.shadowSize % 5).toBe(0);
    expect(reachWarning(wide, { ...P, shadowSize: fit.shadowSize })).toBe(false);
  });
  it('is the largest such size', () => {
    const fit = fitShadowSize(wide, P);
    expect(fitShadowSize(wide, { ...P, shadowSize: fit.shadowSize + 5 }).shadowSize).toBe(fit.shadowSize); // one step more does not fit
  });
  it('keeps the size when the image already fits, including sizes that are not multiples of 5', () => {
    const small = blob(60, 40);
    expect(fitShadowSize(small, P)).toEqual({ shadowSize: 400, ok: true });
    expect(fitShadowSize(small, { ...P, shadowSize: 333 })).toEqual({ shadowSize: 333, ok: true });
  });
  it('never grows, and a blank image keeps the size', () => {
    const blank: GrayImage = { width: N, height: N, pixels: new Float32Array(N * N).fill(1) };
    expect(fitShadowSize(blank, P).shadowSize).toBe(400);
    expect(fitShadowSize(wide, { ...P, shadowSize: 150 }).shadowSize).toBeLessThanOrEqual(150);
  });
  it('follows the image size, rotation and offsets', () => {
    const fit = fitShadowSize(wide, { ...P, imageScale: 50 });
    expect(fit.shadowSize).toBe(400); // half-size image reaches 95 mm
    const off = fitShadowSize(wide, { ...P, offsetX: 100 });
    expect(off.shadowSize).toBeLessThan(fitShadowSize(wide, P).shadowSize);
    expect(reachWarning(wide, { ...P, offsetX: 100, shadowSize: off.shadowSize })).toBe(false);
  });
  it('reports ok = false when even the smallest size cannot fit (shape far off the wall)', () => {
    const far = fitShadowSize(wide, { ...P, offsetX: 600 });
    expect(far.ok).toBe(false);
    expect(far.shadowSize).toBe(100);
  });
});

describe('the lit mask on the table matches the image with the fitted size', () => {
  it('a table point inside the image is shadowed exactly where the image is dark (rays through the wall)', () => {
    const wide = blob(190, 50);
    const fit = fitShadowSize(wide, P);
    const p = { ...P, shadowSize: fit.shadowSize };
    const { geometry: g, field } = buildField(wide, p);
    const o = g.outline, C = o.cols, hf = p.lightHeight, G = groundDrop(p);
    const k = p.shadowSize / N;
    const darkAt = (X: number, Y: number) => Math.abs(X) < (190 / 400) * p.shadowSize && Math.abs(Y) < (50 / 400) * p.shadowSize;
    let checked = 0, mismatch = 0;
    for (let X = -p.shadowSize / 2 + 2; X < p.shadowSize / 2; X += 7)
      for (let Y = -p.shadowSize / 2 + 2; Y < p.shadowSize / 2; Y += 7) {
        const r = Math.hypot(X, Y);
        // the ray from the light to (X, Y) meets the inner surface at height z where |q| (hf + G) / (hf - z) = r
        let best = 0, bd = Infinity;
        for (let i = 0; i < C; i++) { const d = Math.hypot(o.qx[i] / Math.hypot(o.qx[i], o.qy[i]) - X / r, o.qy[i] / Math.hypot(o.qx[i], o.qy[i]) - Y / r); if (d < bd) { bd = d; best = i; } }
        const z = hf - (Math.hypot(o.qx[best], o.qy[best]) * (hf + G)) / r;
        if (z < g.blendBottom + 1 || z > p.height - 0.5) continue; // behind the foot or above the top edge
        if (Math.abs(Math.abs(X) - (190 / 400) * p.shadowSize) < 4 || Math.abs(Math.abs(Y) - (50 / 400) * p.shadowSize) < 4) continue; // edges
        let j = 0;
        while (g.zs[j + 1] < z) j++;
        const solid = field[best + C * (z - g.zs[j] < g.zs[j + 1] - z ? j : j + 1)] > 0;
        checked++;
        if (solid !== darkAt(X, Y)) mismatch++;
      }
    expect(k).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(300);
    expect(mismatch / checked).toBeLessThan(0.01);
  });
});
