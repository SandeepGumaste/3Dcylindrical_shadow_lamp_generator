import { describe, it, expect } from 'vitest';
import type { GrayImage } from '../../../types';
import { labelComponents } from '../../tealightShade';
import {
  DEFAULT_SHADOW_WALL_PARAMS, FOOT, outerHeightAt, ShadowWallParams, buildField, deriveGeometry, validateShadowWallParams, tableScale, groundDrop, DEFAULT_SHADOW_WALL_PARAMS as DEFAULTS,
} from '../shadowWall';

// The base is covered in base.test.ts and the 'with a base' blocks; these tests describe the bare wall.
const P = { ...DEFAULT_SHADOW_WALL_PARAMS, base: false };
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
  it('rejects heights that do not fit the light or the foot', () => {
    expect(validateShadowWallParams({ ...P, height: 90 }).join(' ')).toMatch(/Light Height must be at least 1 mm above Height/);
    expect(validateShadowWallParams({ ...P, height: 89.5 }).join(' ')).toMatch(/Light Height/);
    expect(validateShadowWallParams({ ...P, height: 8 }).join(' ')).toMatch(/at least 20 mm/);
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

describe('tall foot for strongly curved shapes', () => {
  const shapes: [string, ShadowWallParams][] = [
    ['ellipse 100x60', { ...P, kind: 'ellipse', width: 100, length: 60 }],
    ['ellipse 100x40', { ...P, kind: 'ellipse', width: 100, length: 40 }],
    ['rectangle 60x60 r6', { ...P, width: 60, length: 60, cornerRadius: 6 }],
  ];
  for (const [name, p] of shapes) {
    it(`${name}: validates, foot covers 1.25 (sMax - 1) hf, outer height monotone in every column`, () => {
      expect(validateShadowWallParams(p)).toEqual([]);
      const g = deriveGeometry(p), o = g.outline;
      let sMax = 1;
      for (let i = 0; i < o.cols; i++) sMax = Math.max(sMax, o.sRay[i]);
      const need = Math.max(FOOT, 1.25 * (sMax - 1) * p.lightHeight);
      expect(g.blendBottom).toBeCloseTo(need, 9);
      expect(g.zs[g.bandStart]).toBeCloseTo(need, 9);
      expect(g.zs[g.bandEnd]).toBeCloseTo(p.height, 9);
      for (let j = 1; j < g.zs.length; j++) expect(g.zs[j]).toBeGreaterThan(g.zs[j - 1]);
      for (let i = 0; i < o.cols; i++) {
        let prev = -Infinity;
        for (let q = 0; q <= 400; q++) {
          const cur = outerHeightAt(g, p, o.sRay[i], (p.height * q) / 400);
          expect(cur).toBeGreaterThan(prev);
          prev = cur;
        }
      }
    });
  }
  it('rejects only when the enlarged foot leaves no room', () => {
    // thin 12 mm wide wall run: huge ray scale at the ends makes the foot swallow the height
    const p: ShadowWallParams = { ...P, width: 100, length: 13, cornerRadius: 3, wallThickness: 1.4, height: 20 };
    expect(validateShadowWallParams(p).join(' ')).toMatch(/No room for the foot and 5 mm of pattern/);
  });
});

describe('deriveGeometry rows', () => {
  for (const [name, p] of [['rectangle', P], ['ellipse', { ...P, kind: 'ellipse', width: 100, length: 60 } as ShadowWallParams]] as const) {
    it(`${name}: rows rise strictly from 0 to height, the foot uniform and the band runs to the top edge`, () => {
      const g = deriveGeometry(p);
      const zs = g.zs;
      expect(zs[0]).toBe(0);
      expect(zs[zs.length - 1]).toBeCloseTo(p.height, 9);
      for (let j = 1; j < zs.length; j++) expect(zs[j]).toBeGreaterThan(zs[j - 1]);
      expect(zs[g.bandStart]).toBeCloseTo(g.blendBottom, 9);
      expect(zs[g.bandEnd]).toBeCloseTo(p.height, 9);
      expect(g.bandEnd).toBe(zs.length - 1);
      expect(g.blendTop).toBe(p.height);
      expect(g.footRows).toBe(g.bandStart);
      const footStep = zs[1] - zs[0];
      for (let j = 1; j < g.bandStart; j++) expect(zs[j] - zs[j - 1]).toBeCloseTo(footStep, 9);
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

  it('a centred dark disc gives a solid lower patch, light above, a solid foot and an open top row', () => {
    const img = discs([[0, 0, 80]]);
    const { geometry: g, field } = buildField(img, E);
    const C = g.outline.cols;
    expect(solidFrac(field, 0, g.bandStart - 1, C)).toBe(1);
    expect(solidFrac(field, g.zs.length - 1, g.zs.length - 1, C)).toBe(0); // no forced rim: the top row follows the image
    expect(solidFrac(field, rowNear(g.zs, 10), rowNear(g.zs, 10), C)).toBe(1);
    expect(solidFrac(field, rowNear(g.zs, 60), rowNear(g.zs, 60), C)).toBe(0);
  });

  it('invert swaps solid and hole in the band', () => {
    // dark half-plane x > 0 on the table: solid on the +x side, hole on the -x side; invert flips both
    const half: GrayImage = { width: N, height: N, pixels: new Float32Array(N * N).fill(1) };
    for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) half.pixels[y * N + N / 2 + x] = 0;
    const plain = buildField(half, E), inv = buildField(half, { ...E, invert: true });
    const g = plain.geometry, o = g.outline, C = o.cols, j = rowNear(g.zs, 40);
    let pos = 0, neg = 0;
    for (let i = 0; i < C; i++) {
      if (Math.abs(o.qx[i]) < 5) continue;
      const a = plain.field[i + C * j] > 0, b = inv.field[i + C * j] > 0;
      expect(b).toBe(!a);
      if (o.qx[i] > 0) { expect(a).toBe(true); pos++; } else { expect(a).toBe(false); neg++; }
    }
    expect(pos).toBeGreaterThan(50);
    expect(neg).toBeGreaterThan(50);
    expect(solidFrac(inv.field, 0, g.bandStart - 1, C)).toBe(1);
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

  /** True when every solid node is connected (periodic in u) to the foot rows. */
  const allAttached = (field: Float32Array, C: number, rows: number) => {
    const mask = new Uint8Array(field.length);
    for (let n = 0; n < mask.length; n++) mask[n] = field[n] > 0 ? 1 : 0;
    const { labels, count } = labelComponents(mask, C, rows, 1);
    return count === 1 && labels[0] >= 0;
  };

  it('bridges an isolated dark blob in the middle of the band to the foot instead of dropping it', () => {
    // wall at +x: q = 38.8 mm, ray reaches 63.5 mm on the table at z = 35, about 32 mm above the foot
    const img = discs([[46.6, 0, 4]]); // z about 8 to 21 mm: close to the foot
    const r = buildField(img, { ...E, minFeature: 0 });
    expect(r.report.bridged).toBe(1);
    expect(r.report.floatingRemoved).toBe(0);
    expect(allAttached(r.field, r.geometry.outline.cols, r.geometry.zs.length)).toBe(true);
  });

  it('chains two floating pieces: the upper one has nothing else within reach', () => {
    const img = discs([[49.9, 0, 5], [83.1, 0, 3]]); // z 12..26 and z 46..49: the upper is 43 mm above the foot
    const r = buildField(img, { ...E, minFeature: 0 });
    expect(r.report.bridged).toBe(2);
    expect(r.report.floatingRemoved).toBe(0);
    expect(allAttached(r.field, r.geometry.outline.cols, r.geometry.zs.length)).toBe(true);
  });

  it('drops and counts a blob with nothing within reach (high up, 50 mm above the foot)', () => {
    const r = buildField(discs([[110, 0, 5]]), { ...E, minFeature: 0 }); // z about 55..60
    expect(r.report.floatingRemoved).toBeGreaterThanOrEqual(1);
    expect(r.report.bridged).toBe(0);
    expect(solidFrac(r.field, r.geometry.bandStart, r.geometry.zs.length - 1, r.geometry.outline.cols)).toBe(0);
  });

  it('inverted centred disc: the lit ring above it is bridged to the foot (or dropped and reported)', () => {
    const r = buildField(discs([[0, 0, 60]]), { ...E, invert: true, minFeature: 0 });
    expect(r.report.bridged + r.report.floatingRemoved).toBeGreaterThanOrEqual(1);
    expect(r.report.bridged).toBe(1); // the ring starts about 28 mm above the foot, within reach
    expect(r.report.floatingRemoved).toBe(0);
    const C = r.geometry.outline.cols;
    expect(solidFrac(r.field, r.geometry.zs.length - 1, r.geometry.zs.length - 1, C)).toBe(1);
    expect(allAttached(r.field, C, r.geometry.zs.length)).toBe(true);
  });

  it('a dark strip from the foot to the top edge stays, solid on its top row only', () => {
    const strip: GrayImage = { width: N, height: N, pixels: new Float32Array(N * N).fill(1) };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const X = (x + 0.5 - N / 2) * (400 / N), Y = -(y + 0.5 - N / 2) * (400 / N);
      if (X > 0 && Math.abs(Y) < 15) strip.pixels[y * N + x] = 0;
    }
    const { geometry: g, field, report } = buildField(strip, { ...E, minFeature: 0 });
    const C = g.outline.cols;
    const col = Array.from({ length: C }, (_, i) => i).reduce((b, i) => (Math.hypot(g.outline.qy[i], g.outline.qx[i] - 38.8) < Math.hypot(g.outline.qy[b], g.outline.qx[b] - 38.8) ? i : b), 0);
    expect(field[col + C * (g.zs.length - 1)]).toBeGreaterThan(0); // the top row is solid where the strip is
    expect(report.floatingRemoved).toBe(0);
    expect(solidFrac(field, g.zs.length - 1, g.zs.length - 1, C)).toBeLessThan(0.5);
  });

  it('a dark blob that reaches the top edge but is not connected to the foot is removed and counted', () => {
    const { geometry: g, field, report } = buildField(discs([[174.6, 0, 6]]), { ...E, minFeature: 0 });
    expect(report.floatingRemoved).toBeGreaterThanOrEqual(1);
    expect(solidFrac(field, g.bandStart, g.zs.length - 1, g.outline.cols)).toBe(0);
  });

  it('a blob connected to the foot and touching the top row is kept', () => {
    // wide dark disc on the axis plus a dark column up the +x side to the top edge
    const img = discs([[0, 0, 80]]);
    const k = 400 / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const X = (x + 0.5 - N / 2) * k, Y = -(y + 0.5 - N / 2) * k;
      if (X > 0 && Math.abs(Y) < 10) img.pixels[y * N + x] = 0;
    }
    const { geometry: g, field, report } = buildField(img, { ...E, minFeature: 0 });
    expect(report.floatingRemoved).toBe(0);
    expect(solidFrac(field, g.zs.length - 1, g.zs.length - 1, g.outline.cols)).toBeGreaterThan(0);
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

describe('ground drop (base)', () => {
  const B: ShadowWallParams = { ...DEFAULTS, base: true, baseThickness: 4, edgeRounding: 0 };
  const N0: ShadowWallParams = { ...B, base: false };

  it('tableScale is exactly hf / (hf - z) without a drop and (hf + G) / (hf - z) with one', () => {
    expect(groundDrop(N0)).toBe(0);
    expect(groundDrop(B)).toBe(4);
    expect(tableScale(90, 0, 30)).toBe(90 / 60);
    expect(tableScale(90, 4, 30)).toBeCloseTo(94 / 60, 12);
  });

  it('the base only changes the row spacing through (hf + G): rows get denser by that factor', () => {
    const a = deriveGeometry(N0), b = deriveGeometry(B);
    const z = a.zs[a.bandStart], hf = B.lightHeight, cell = a.outline.perimeter / a.outline.cols;
    let dMax = 0;
    for (let i = 0; i < a.outline.cols; i++) dMax = Math.max(dMax, a.outline.dIn[i]);
    expect(a.zs[a.bandStart + 1] - z).toBeCloseTo((cell * (hf - z) ** 2) / (dMax * hf), 9);
    expect(b.zs[b.bandStart + 1] - z).toBeCloseTo((cell * (hf - z) ** 2) / (dMax * (hf + 4)), 9);
    expect(b.zs[b.bandStart + 1] - z).toBeLessThan(a.zs[a.bandStart + 1] - z);
  });

  it('a node is lit or shadowed by the image at the scaled table position', () => {
    // dark disc of table radius 80 centred on the axis; a node at (q, z) is solid iff |q| (hf + G) / (hf - z) < 80
    const img = discs([[0, 0, 80]]);
    const { geometry: g, field } = buildField(img, B);
    const o = g.outline;
    let checked = 0;
    for (let j = g.bandStart; j <= g.bandEnd; j += 7)
      for (let i = 0; i < o.cols; i += 11) {
        const d = Math.hypot(o.qx[i], o.qy[i]) * tableScale(B.lightHeight, 4, g.zs[j]);
        if (Math.abs(d - 80) < 3) continue;
        expect(field[i + o.cols * j] > 0).toBe(d < 80);
        checked++;
      }
    expect(checked).toBeGreaterThan(50);
  });
});
