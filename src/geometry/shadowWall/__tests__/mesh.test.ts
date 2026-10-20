import { describe, it, expect } from 'vitest';
import type { GrayImage } from '../../../types';
import { DEFAULT_SHADOW_WALL_PARAMS, ShadowWallParams, deriveGeometry, generateShadowWall, surfaceMaps } from '../shadowWall';

const P = DEFAULT_SHADOW_WALL_PARAMS;
const N = 256;

function flat(v: number): GrayImage {
  return { width: N, height: N, pixels: new Float32Array(N * N).fill(v) };
}
/** White image with one dark disc at the centre, radius r mm on the table (400 mm canvas). */
function disc(rMm: number): GrayImage {
  const img = flat(1);
  const k = 400 / N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) < rMm / k) img.pixels[y * N + x] = 0;
  return img;
}

const shapes: [string, ShadowWallParams][] = [
  ['rectangle', { ...P }],
  ['ellipse', { ...P, kind: 'ellipse', width: 90, length: 70 }],
];

describe('generateShadowWall', () => {
  for (const [name, p] of shapes) {
    describe(name, () => {
      const res = generateShadowWall(disc(60), p);
      it('is watertight with positive volume and a sane triangle count', () => {
        expect(res.report.check.errors).toEqual([]);
        expect(res.report.check.watertight).toBe(true);
        expect(res.report.check.signedVolume).toBeGreaterThan(0);
        expect(res.triangleCount).toBeLessThan(1_500_000);
        expect(res.triangleCount).toBe(res.indices.length / 3);
      });
      it('fits the footprint and the height', () => {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let v = 0; v < res.positions.length; v += 3) {
          x0 = Math.min(x0, res.positions[v]); x1 = Math.max(x1, res.positions[v]);
          y0 = Math.min(y0, res.positions[v + 1]); y1 = Math.max(y1, res.positions[v + 1]);
          z0 = Math.min(z0, res.positions[v + 2]); z1 = Math.max(z1, res.positions[v + 2]);
        }
        expect(x1 - x0).toBeCloseTo(p.width, 1);
        expect(y1 - y0).toBeCloseTo(p.length, 1);
        expect(z0).toBeCloseTo(0, 4);
        expect(z1).toBeCloseTo(p.height, 3);
      });
      it('keeps the inner surface exactly one wall thickness inside the outer at the foot', () => {
        let n = 0;
        for (let v = 0; v + 1 < res.positions.length / 3; v += 2) {
          const a = 3 * v, b = 3 * (v + 1);
          if (Math.abs(res.positions[a + 2]) > 1e-6) continue;
          const d = Math.hypot(res.positions[a] - res.positions[b], res.positions[a + 1] - res.positions[b + 1]);
          expect(d).toBeCloseTo(p.wallThickness, 3);
          n++;
        }
        expect(n).toBeGreaterThan(100);
      });
    });
  }

  it('a blank image gives only the foot and rim, with a warning', () => {
    const res = generateShadowWall(flat(1), P);
    const g = res.geometry, C = g.outline.cols;
    for (let j = 0; j < g.zs.length; j++) {
      const solid = j < g.footRows || j >= g.rimStart;
      for (let i = 0; i < C; i++) if (j > g.bandStart && j < g.bandEnd) expect(res.field[i + C * j]).toBeLessThan(0);
      if (solid) expect(res.field[C * j]).toBeGreaterThan(0);
    }
    expect(res.report.check.watertight).toBe(true);
    expect(res.report.warnings.some((w) => /nothing is shadowed/i.test(w))).toBe(true);
  });

  it('a fully black image gives a closed solid shell', () => {
    const res = generateShadowWall(flat(0), P);
    expect(res.report.check.watertight).toBe(true);
    expect(res.report.check.signedVolume).toBeGreaterThan(0);
    expect(res.report.warnings.some((w) => /nothing is shadowed/i.test(w))).toBe(false);
  });

  it('throws on invalid parameters', () => {
    expect(() => generateShadowWall(flat(1), { ...P, wallThickness: -1 })).toThrow();
  });
});

/** Distance from (x, y) to the closed polygon through the outer outline samples. */
function distToOuter(o: { px: Float64Array; py: Float64Array; cols: number }, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < o.cols; i++) {
    const j = (i + 1) % o.cols;
    const ex = o.px[j] - o.px[i], ey = o.py[j] - o.py[i];
    const t = Math.min(1, Math.max(0, ((x - o.px[i]) * ex + (y - o.py[i]) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(x - o.px[i] - t * ex, y - o.py[i] - t * ey));
  }
  return best;
}
/** Miss distance of the straight line from the light through the inner point to the outer point. */
function rayMiss(hf: number, a: number[], b: number[]): number {
  const d = [a[0], a[1], a[2] - hf], r = [b[0], b[1], b[2] - hf];
  const cx = d[1] * r[2] - d[2] * r[1], cy = d[2] * r[0] - d[0] * r[2], cz = d[0] * r[1] - d[1] * r[0];
  return Math.hypot(cx, cy, cz) / Math.hypot(d[0], d[1], d[2]);
}

describe('ray-exact outer surface', () => {
  const cases: [string, ShadowWallParams][] = [
    ['rectangle r10', { ...P }],
    ['rectangle r2.4', { ...P, cornerRadius: 2.4 }],
    ['ellipse 90x70', { ...P, kind: 'ellipse', width: 90, length: 70 }],
  ];
  for (const [name, p] of cases) {
    it(`${name}: every column's outer node is on the ray and on the outer outline`, () => {
      const g = deriveGeometry(p), o = g.outline;
      const { inner, outer } = surfaceMaps(g, p);
      const zs = [g.blendBottom + 0.5, (g.blendBottom + g.blendTop) / 2, g.blendTop - 0.5];
      for (const z of zs) {
        let worstRay = 0, worstOutline = 0;
        for (let i = 0; i < o.cols; i++) {
          const th = (2 * Math.PI * i) / o.cols;
          const a = inner(th, z), b = outer(th, z);
          worstRay = Math.max(worstRay, rayMiss(p.lightHeight, a, b));
          worstOutline = Math.max(worstOutline, distToOuter(o, b[0], b[1]));
        }
        expect(worstRay).toBeLessThan(1e-9);
        expect(worstOutline).toBeLessThan(1e-6);
      }
    });
  }
  it('holds on a straight side away from the axis and between samples', () => {
    const p = P;
    const g = deriveGeometry(p), o = g.outline;
    const { inner, outer } = surfaceMaps(g, p);
    // the column whose inner point is nearest (40 - t, -30)
    let best = 0, bd = Infinity;
    for (let i = 0; i < o.cols; i++) { const d = Math.hypot(o.qx[i] - (40 - p.wallThickness), o.qy[i] + 30); if (d < bd) { bd = d; best = i; } }
    expect(Math.abs(o.nx[best] * o.qy[best] - o.ny[best] * o.qx[best])).toBeGreaterThan(10); // normal is far from radial
    for (const u of [best, best + 0.37, best + 0.5]) {
      for (const z of [g.blendBottom + 1, (g.blendBottom + g.blendTop) / 2, g.blendTop - 1]) {
        const th = (2 * Math.PI * u) / o.cols;
        expect(rayMiss(p.lightHeight, inner(th, z), outer(th, z))).toBeLessThan(1e-9);
      }
    }
    const th = (2 * Math.PI * best) / o.cols;
    const b = outer(th, g.blendBottom + 1);
    expect(distToOuter(o, b[0], b[1])).toBeLessThan(1e-6);
  });
  it('the mesh uses these maps (float32 mesh vertices stay on the ray)', () => {
    const res = generateShadowWall(flat(0), P);
    const g = res.geometry;
    let n = 0;
    for (let v = 0; v + 1 < res.positions.length / 3; v += 2) {
      const a = 3 * v, b = 3 * (v + 1), z = res.positions[a + 2];
      if (z < g.blendBottom + 0.5 || z > g.blendTop - 0.5) continue;
      expect(rayMiss(P.lightHeight, [res.positions[a], res.positions[a + 1], z], [res.positions[b], res.positions[b + 1], res.positions[b + 2]])).toBeLessThan(2e-3);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });
});

describe('warnings', () => {
  it('a removed-only image gets the floating warning, not the blank one', () => {
    const img = flat(1);
    // a dark spot in the middle of the pattern, not touching the foot or rim, becomes floating and is removed
    const k = 400 / N;
    const g = deriveGeometry(P);
    const zMid = (g.blendBottom + g.blendTop) / 2;
    const r = (P.width / 2 - 1) * P.lightHeight / (P.lightHeight - zMid);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x + 0.5 - N / 2 - r / k, y + 0.5 - N / 2) < 5 / k) img.pixels[y * N + x] = 0;
    const res = generateShadowWall(img, { ...P, minFeature: 0 });
    expect(res.report.floatingRemoved).toBeGreaterThan(0);
    expect(res.report.warnings.some((w) => /floating/i.test(w))).toBe(true);
    expect(res.report.warnings.some((w) => /nothing is shadowed/i.test(w))).toBe(false);
  });
  it('a dark ring far outside the wall reach warns; a small central disc does not', () => {
    const ring = flat(1);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) * (400 / N);
      if (r > 150 && r < 190) ring.pixels[y * N + x] = 0;
    }
    const far = generateShadowWall(ring, P, false);
    expect(far.report.warnings.some((w) => /beyond the wall's reach/.test(w))).toBe(true);
    const near = generateShadowWall(disc(20), P, false);
    expect(near.report.warnings.some((w) => /beyond the wall's reach/.test(w))).toBe(false);
  });
});
