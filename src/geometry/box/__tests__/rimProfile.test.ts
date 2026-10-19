import { describe, it, expect } from 'vitest';
import { buildRimProfile, DEFAULT_BOX_PARAMS, MIN_WALL_HEIGHT, PROFILE_STEP, type BoxParams } from '../rimProfile';
import { heightForReach, rimPoint } from '../shadowModel';
import { KIT, WALL_IDS } from '../kitSpec';
import type { GrayImage } from '../../../types';

const P = (o: Partial<BoxParams> = {}): BoxParams => ({ ...DEFAULT_BOX_PARAMS, ...o });
/** 450 px square, one pixel per mm at the default shadow size; dark where `dark(xMm, yMm)` (axis at the centre, y up). */
const raster = (dark: (x: number, y: number) => boolean, n = 450): GrayImage => {
  const pixels = new Float32Array(n * n).fill(1);
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) if (dark(px + 0.5 - n / 2, n / 2 - (py + 0.5))) pixels[py * n + px] = 0;
  return { width: n, height: n, pixels };
};
const disc = (R: number) => raster((x, y) => Math.hypot(x, y) < R);
const maxAllowed = (id: (typeof WALL_IDS)[number], p: BoxParams) => Math.min(KIT.walls[id].maxHeight, p.lightHeight - 1);

describe('rim profile from the silhouette image', () => {
  it('puts the wall top where the formula says for a disc shadow', () => {
    const p = P({ lightHeight: 40 });
    const prof = buildRimProfile(disc(150), p);
    const s = 60, i = Math.round(s / PROFILE_STEP);
    const { d } = rimPoint('w1', s);
    expect(prof.heights.w1[i]).toBeCloseTo(heightForReach(150, d, 40, KIT.T), 0);
  });

  it('gives adjacent walls the same height at every shared corner, for an asymmetric image', () => {
    const img = raster((x, y) => (x > 20 && x < 90 && y > -30 && y < 140) || Math.hypot(x + 80, y + 40) < 50);
    const { heights: h } = buildRimProfile(img, P());
    const last = (id: (typeof WALL_IDS)[number]) => h[id][h[id].length - 1];
    expect(h.w4[0]).toBeCloseTo(h.w3[0], 6);
    expect(last('w4')).toBeCloseTo(h.w2[0], 6);
    expect(h.w1[0]).toBeCloseTo(last('w3'), 6);
    expect(last('w1')).toBeCloseTo(last('w2'), 6);
  });

  it('keeps a blank image at the minimum wall height and says the shadow is empty', () => {
    const prof = buildRimProfile(raster(() => false), P());
    for (const id of WALL_IDS) expect(Math.max(...prof.heights[id])).toBeCloseTo(MIN_WALL_HEIGHT, 6);
    expect(prof.warnings.join(' ')).toMatch(/no dark shape/i);
  });

  it('clamps and warns when the light height cannot reach the requested shadow size', () => {
    const prof = buildRimProfile(disc(220), P({ lightHeight: 21, shadowSize: 3000 }));
    expect(prof.clamped).toBe(true);
    expect(prof.warnings.join(' ')).toMatch(/light height/i);
    for (const id of WALL_IDS) expect(Math.max(...prof.heights[id])).toBeLessThanOrEqual(maxAllowed(id, P({ lightHeight: 21 })) + 1e-6);
  });

  it('never exceeds the wall height or the light height, and never returns NaN', () => {
    const p = P();
    const prof = buildRimProfile(disc(200), p);
    for (const id of WALL_IDS) for (const v of prof.heights[id]) {
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBeLessThanOrEqual(maxAllowed(id, p) + 1e-6);
      expect(v).toBeGreaterThanOrEqual(MIN_WALL_HEIGHT - 1e-6);
    }
  });

  it('widens single-pixel noise to the minimum spike width', () => {
    const pts = [[170, 40], [-120, 130], [60, -190], [-200, -60]];
    const prof = buildRimProfile(raster((x, y) => pts.some(([a, b]) => Math.abs(x - a) < 1 && Math.abs(y - b) < 1)), P());
    for (const id of WALL_IDS) {
      const h = prof.heights[id];
      let run = 0;
      for (let i = 0; i <= h.length; i++) {
        if (i < h.length && h[i] > MIN_WALL_HEIGHT + 0.5) run++;
        else { if (run > 0 && i - run > 0 && i < h.length) expect(run * PROFILE_STEP).toBeGreaterThanOrEqual(1.2 - PROFILE_STEP); run = 0; }
      }
    }
    expect(prof.warnings.join(' ')).toMatch(/narrower than 1\.2 mm/);
  });

  it('always says only one-reach-per-direction shapes are reproduced', () => {
    expect(buildRimProfile(disc(100), P()).warnings.join(' ')).toMatch(/one reach per direction/);
  });
});
