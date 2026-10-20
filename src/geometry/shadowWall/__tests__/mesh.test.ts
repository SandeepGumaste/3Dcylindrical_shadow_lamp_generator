import { describe, it, expect } from 'vitest';
import type { GrayImage } from '../../../types';
import { DEFAULT_SHADOW_WALL_PARAMS, ShadowWallParams, generateShadowWall } from '../shadowWall';

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
      it('sends the outer surface along the ray from the light', () => {
        const g = res.geometry, o = g.outline, hf = p.lightHeight;
        let i = -1, j = g.bandStart + 2;
        for (; j < g.bandEnd && i < 0; j++) for (let c = 0; c < o.cols; c++) if (res.field[c + o.cols * j] > 0) { i = c; break; }
        j--;
        expect(i).toBeGreaterThanOrEqual(0);
        const z = g.zs[j];
        let found = false;
        for (let v = 0; v + 1 < res.positions.length / 3; v += 2) {
          const a = 3 * v, b = 3 * (v + 1);
          if (Math.abs(res.positions[a + 2] - z) > 1e-4 || Math.hypot(res.positions[a] - o.qx[i], res.positions[a + 1] - o.qy[i]) > 1e-4) continue;
          const s = o.dOut[i] / o.dIn[i];
          expect(res.positions[b]).toBeCloseTo(o.qx[i] * s, 3);
          expect(res.positions[b + 1]).toBeCloseTo(o.qy[i] * s, 3);
          expect(res.positions[b + 2]).toBeCloseTo(hf - (hf - z) * s, 3);
          found = true;
        }
        expect(found).toBe(true);
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
