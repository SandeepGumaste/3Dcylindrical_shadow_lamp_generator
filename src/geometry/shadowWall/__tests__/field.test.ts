import { describe, it, expect } from 'vitest';
import type { GrayImage } from '../../../types';
import {
  DEFAULT_SHADOW_WALL_PARAMS, FOOT, RIM, ShadowWallParams, buildField, deriveGeometry, validateShadowWallParams,
} from '../shadowWall';

const P = DEFAULT_SHADOW_WALL_PARAMS;
const N = 512;

/** White image with dark discs; each disc is (centre x, centre y, radius) in mm on the table (y up), at 400 mm / 512 px. */
function discs(list: [number, number, number][], dark = 0): GrayImage {
  const pixels = new Float32Array(N * N).fill(1);
  const k = 400 / N;
  for (const [mx, my, mr] of list) {
    const cx = N / 2 + mx / k, cy = N / 2 - my / k, r = mr / k;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r) pixels[y * N + x] = dark;
  }
  return { width: N, height: N, pixels };
}
const solidFrac = (f: Float32Array, from: number, to: number, C: number) => {
  let s = 0;
  for (let idx = from * C; idx < (to + 1) * C; idx++) if (f[idx] > 0) s++;
  return s / ((to - from + 1) * C);
};
const rowNear = (zs: Float64Array, z: number) => zs.findIndex((v) => v >= z);

describe('validateShadowWallParams', () => {
  it('accepts the defaults', () => {
    expect(validateShadowWallParams(P)).toEqual([]);
  });
  it('rejects bad sizes and radii', () => {
    expect(validateShadowWallParams({ ...P, width: 8 }).join(' ')).toMatch(/Width and Length must exceed/);
    expect(validateShadowWallParams({ ...P, wallThickness: -1 }).join(' ')).toMatch(/Wall Thickness must be positive/);
    expect(validateShadowWallParams({ ...P, cornerRadius: 41 }).join(' ')).toMatch(/Corner Radius/);
    expect(validateShadowWallParams({ ...P, cornerRadius: 1 }).join(' ')).toMatch(/Corner Radius/);
    expect(validateShadowWallParams({ ...P, shadowSize: -5 }).join(' ')).toMatch(/Shadow Size/);
    expect(validateShadowWallParams({ ...P, imageScale: 5 }).join(' ')).toMatch(/Image Size/);
  });
  it('rejects heights that do not fit the light or the foot and rim', () => {
    expect(validateShadowWallParams({ ...P, height: 90 }).join(' ')).toMatch(/Light Height must be at least 1 mm above Height/);
    expect(validateShadowWallParams({ ...P, height: 89.5 }).join(' ')).toMatch(/Light Height/);
    expect(validateShadowWallParams({ ...P, height: 8 }).join(' ')).toMatch(/No room for the foot, rim/);
    expect(validateShadowWallParams({ ...P, height: 15 }).join(' ')).toMatch(/at least 20 mm/);
  });
  it('rejects non-positive and too pointed ellipses before building anything', () => {
    const ell: ShadowWallParams = { ...P, kind: 'ellipse', width: 100, length: 80 };
    expect(validateShadowWallParams(ell)).toEqual([]);
    expect(validateShadowWallParams({ ...ell, width: 0 }).join(' ')).toMatch(/must be positive/);
    expect(validateShadowWallParams({ ...ell, length: -3 }).join(' ')).toMatch(/must be positive/);
    // b^2 / a = 15^2 / 150 = 1.5 < 2 * 1.2
    expect(validateShadowWallParams({ ...ell, width: 300, length: 30 }).join(' ')).toMatch(/too pointed/);
  });
});

describe('deriveGeometry rows', () => {
  for (const [name, p] of [['rectangle', P], ['ellipse', { ...P, kind: 'ellipse', width: 100, length: 60 } as ShadowWallParams]] as const) {
    it(`${name}: rows rise strictly from 0 to height, foot and rim uniform`, () => {
      const g = deriveGeometry(p);
      const zs = g.zs;
      expect(zs[0]).toBe(0);
      expect(zs[zs.length - 1]).toBeCloseTo(p.height, 9);
      for (let j = 1; j < zs.length; j++) expect(zs[j]).toBeGreaterThan(zs[j - 1]);
      expect(zs[g.bandStart]).toBeCloseTo(FOOT, 9);
      expect(zs[g.bandEnd]).toBeCloseTo(p.height - RIM, 9);
      expect(g.rimStart).toBe(g.bandEnd + 1);
      expect(g.footRows).toBe(g.bandStart);
      const footStep = zs[1] - zs[0];
      for (let j = 1; j < g.bandStart; j++) expect(zs[j] - zs[j - 1]).toBeCloseTo(footStep, 9);
      const rimStep = zs[g.rimStart] - zs[g.bandEnd];
      for (let j = g.rimStart; j < zs.length; j++) expect(zs[j] - zs[j - 1]).toBeCloseTo(rimStep, 9);
      expect(g.bandEnd - g.bandStart + 1).toBeLessThanOrEqual(1500);
      expect(zs.length).toBeLessThanOrEqual(1700);
    });

    it(`${name}: the table position moves at most 1.5 cells per band row`, () => {
      const g = deriveGeometry(p);
      const o = g.outline, cell = o.perimeter / o.cols, hf = p.lightHeight;
      for (let n = 0; n < 20; n++) {
        const i = Math.floor((n * o.cols) / 20);
        for (let j = g.bandStart + 1; j <= g.bandEnd; j++) {
          const s0 = hf / (hf - g.zs[j - 1]), s1 = hf / (hf - g.zs[j]);
          const step = Math.hypot(o.qx[i] * (s1 - s0), o.qy[i] * (s1 - s0));
          expect(step).toBeLessThanOrEqual(1.5 * cell);
        }
      }
    });
  }
});

describe('buildField', () => {
  const E = { ...P, edgeRounding: 0 };

  it('a centred dark disc gives a solid lower patch, light above, and a solid foot and rim', () => {
    const img = discs([[0, 0, 80]]);
    const { geometry: g, field } = buildField(img, E);
    const C = g.outline.cols;
    expect(solidFrac(field, 0, g.bandStart - 1, C)).toBe(1);
    expect(solidFrac(field, g.rimStart, g.zs.length - 1, C)).toBe(1);
    expect(solidFrac(field, rowNear(g.zs, 10), rowNear(g.zs, 10), C)).toBe(1);
    expect(solidFrac(field, rowNear(g.zs, 60), rowNear(g.zs, 60), C)).toBe(0);
  });

  it('invert swaps solid and hole in the band', () => {
    const img = discs([[0, 0, 80]]);
    const { geometry: g, field } = buildField(img, { ...E, invert: true });
    const C = g.outline.cols;
    expect(solidFrac(field, rowNear(g.zs, 10), rowNear(g.zs, 10), C)).toBe(0);
    expect(solidFrac(field, rowNear(g.zs, 60), rowNear(g.zs, 60), C)).toBe(1);
    expect(solidFrac(field, 0, g.bandStart - 1, C)).toBe(1);
  });

  it('pixels outside the canvas count as light', () => {
    const dark = discs([[0, 0, 1000]]);
    const { geometry: g, field } = buildField(dark, { ...E, imageScale: 10 }); // canvas only 40 mm wide
    expect(solidFrac(field, g.bandStart, g.bandEnd, g.outline.cols)).toBe(0);
    const full = buildField(dark, E);
    expect(solidFrac(full.field, full.geometry.bandStart, full.geometry.bandEnd, g.outline.cols)).toBe(1);
  });

  /** Checks one band row against a table-space disc: solid iff the ray's table point is inside (3 mm margin). */
  const checkRow = (p: ShadowWallParams, img: GrayImage, cx: number, cy: number, r: number) => {
    const { geometry: g, field } = buildField(img, p);
    const o = g.outline, j = rowNear(g.zs, 40), s = p.lightHeight / (p.lightHeight - g.zs[j]);
    let inside = 0, outside = 0;
    for (let i = 0; i < o.cols; i++) {
      const d = Math.hypot(o.qx[i] * s - cx, o.qy[i] * s - cy);
      if (d < r - 3) { expect(field[i + o.cols * j]).toBeGreaterThan(0); inside++; }
      else if (d > r + 3) { expect(field[i + o.cols * j]).toBeLessThanOrEqual(0); outside++; }
    }
    expect(inside).toBeGreaterThan(20);
    expect(outside).toBeGreaterThan(20);
  };

  it('offsetX moves the patch by the same millimetres on the table', () => {
    checkRow({ ...E, offsetX: 30 }, discs([[0, 0, 70]]), 30, 0, 70);
    checkRow({ ...E, offsetY: -25 }, discs([[0, 0, 70]]), 0, -25, 70);
  });

  it('rotation turns the image counter-clockwise on the table', () => {
    // a disc on image +x turns to table +y at 90 degrees, and to -x at 180
    checkRow({ ...E, rotation: 90 }, discs([[40, 0, 70]]), 0, 40, 70);
    checkRow({ ...E, rotation: 180 }, discs([[40, 0, 70]]), -40, 0, 70);
    checkRow({ ...E, rotation: 0 }, discs([[40, 0, 70]]), 40, 0, 70);
  });

  it('removes and counts an isolated dark blob in the middle of the band', () => {
    // wall at +x: q = 38.8 mm, ray reaches 63.5 mm on the table at z = 35
    const img = discs([[63.5, 0, 6]]);
    const loose = buildField(img, { ...E, minFeature: 0 });
    expect(loose.report.floatingRemoved).toBeGreaterThanOrEqual(1);
    expect(solidFrac(loose.field, loose.geometry.bandStart, loose.geometry.bandEnd, loose.geometry.outline.cols)).toBe(0);
  });

  it('edge rounding widens soft edges', () => {
    const img = discs([[0, 0, 80]]);
    const softNodes = (edgeRounding: number) => {
      const { field } = buildField(img, { ...P, edgeRounding });
      let n = 0;
      for (const v of field) if (Math.abs(v) < 120 && Math.abs(v) !== 255) n++;
      return n;
    };
    expect(softNodes(40)).toBeGreaterThan(softNodes(0));
  });
});
