import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEALIGHT_PARAMS, TealightParams, deriveGeometry, tableRadiusAt, wallHeightForTableRadius,
  zMaxFormula, tableToPixel, pixelToTable, labelComponents, generateTealightShade, compareShadow,
  validateTealightParams, buildTealightField,
} from '../tealightShade';
import { TEALIGHT_SAMPLES, asymmetricTestImage } from '../../image/tealightSamples';

const P = (o: Partial<TealightParams> = {}): TealightParams => ({ ...DEFAULT_TEALIGHT_PARAMS, ...o });

describe('tealight formulas', () => {
  it('r(z) = R(z) hf / (hf - z)', () => {
    const g = deriveGeometry(P());
    // z = 0 lands at the wall radius itself; hf = 25, Rb = 30, k = -10/70
    expect(tableRadiusAt(g, 0)).toBeCloseTo(30, 9);
    const z = 10;
    expect(tableRadiusAt(g, z)).toBeCloseTo(((30 + g.k * z) * 25) / 15, 9);
  });

  it('z_max formula puts r(z_max) exactly at the shadow radius', () => {
    const p = P();
    const Rb = p.innerDiameter / 2;
    const k = (p.topDiameter / 2 - Rb) / p.height;
    const zm = zMaxFormula(Rb, k, p.flameHeight, p.shadowRadius);
    expect(zm).toBeCloseTo((25 * (150 - 30)) / (150 + k * 25), 9);
    expect(tableRadiusAt({ Rb, k, hf: 25 }, zm)).toBeCloseTo(150, 6);
  });

  it('clamps z_max below hf - 1 mm', () => {
    const g = deriveGeometry(P({ shadowRadius: 5000 }));
    expect(g.zmax).toBeLessThanOrEqual(g.hf - 1 + 1e-9);
  });

  it('inverse then forward mapping round-trips within half a pixel', () => {
    const img = asymmetricTestImage(400);
    const p = P();
    const g = deriveGeometry(p);
    const rMin = tableRadiusAt(g, g.baseBand), rMax = tableRadiusAt(g, g.zmax);
    let worst = 0, n = 0;
    for (let py = 3; py < 400; py += 17) {
      for (let px = 5; px < 400; px += 13) {
        const [x, y] = pixelToTable(img, p.shadowRadius, px, py);
        const r = Math.hypot(x, y);
        if (r < rMin || r > rMax) continue;
        const th = Math.atan2(y, x);
        const z = wallHeightForTableRadius(g, r);          // inverse: table -> wall
        const r2 = tableRadiusAt(g, z);                     // forward: wall -> table
        const [qx, qy] = tableToPixel(img, p.shadowRadius, r2 * Math.cos(th), r2 * Math.sin(th));
        worst = Math.max(worst, Math.hypot(qx - px, qy - py)); n++;
      }
    }
    expect(n).toBeGreaterThan(50);
    expect(worst).toBeLessThan(0.5);
  });
});

describe('tealight table shadow', () => {
  const flipH = (m: Uint8Array, n: number) => Uint8Array.from(m, (_, i) => m[Math.floor(i / n) * n + (n - 1 - (i % n))]);
  const flipV = (m: Uint8Array, n: number) => Uint8Array.from(m, (_, i) => m[(n - 1 - Math.floor(i / n)) * n + (i % n)]);
  const iou = (a: Uint8Array, b: Uint8Array, valid: Uint8Array) => {
    let i = 0, u = 0;
    for (let k = 0; k < a.length; k++) { if (!valid[k]) continue; if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; }
    return u ? i / u : 1;
  };

  it('is not mirrored (asymmetric image)', () => {
    const img = asymmetricTestImage(512);
    const p = P({ vents: 0, ribs: 0 });
    const res = generateTealightShade(img, p);
    const cmp = compareShadow(img, p, res, 256);
    expect(cmp.iou).toBeGreaterThan(0.9);
    expect(iou(cmp.projected, flipH(cmp.target, cmp.size), cmp.valid)).toBeLessThan(0.6);
    expect(iou(cmp.projected, flipV(cmp.target, cmp.size), cmp.valid)).toBeLessThan(0.6);
  });

  for (const s of TEALIGHT_SAMPLES) {
    it(`sample "${s.name}" matches its thresholded image (IoU >= 0.9) and is watertight`, () => {
      const p = P(s.params);
      const img = s.make(512);
      const res = generateTealightShade(img, p);
      const cmp = compareShadow(img, p, res, 256);
      expect(cmp.iou).toBeGreaterThanOrEqual(0.9);
      expect(res.report.check.errors).toEqual([]);
      expect(res.report.check.watertight).toBe(true);
      expect(res.triangleCount).toBeLessThan(1_000_000);
    });
  }
});

describe('islands and printability', () => {
  it('finds the middle of an "O"', () => {
    const W = 40, Hh = 20;
    const m = new Uint8Array(W * Hh).fill(0);
    // solid everywhere except a hole ring; the centre stays solid inside the ring
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) m[i + W * j] = 1;
    for (let j = 5; j <= 14; j++) for (let i = 10; i <= 29; i++) {
      const d = Math.hypot((i - 19.5) / 10, (j - 9.5) / 5);
      if (d > 0.45 && d < 0.9) m[i + W * j] = 0;
    }
    const { labels, count } = labelComponents(m, W, Hh, 1);
    expect(count).toBe(2); // outer material and the centre of the O
    const centre = labels[20 + W * 10];
    const outer = labels[0];
    expect(centre).not.toBe(outer);
  });

  it('reports an island for an O shape and bridges it when asked', () => {
    // black ring (hole) with a solid centre, far from the ribs
    const n = 512;
    const pixels = new Float32Array(n * n).fill(1);
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      const x = ((px + 0.5) / n - 0.5) * 2, y = -((py + 0.5) / n - 0.5) * 2;
      const r = Math.hypot(x - 0.0, y - 0.62); // ring centred on the +y axis at r = 0.62
      if (r > 0.12 && r < 0.2) pixels[py * n + px] = 0;
    }
    const img = { width: n, height: n, pixels };
    const off = buildTealightField(img, P({ ribs: 0, vents: 0, autoBridge: false }));
    expect(off.report.islandsFound).toBe(1);
    const on = buildTealightField(img, P({ ribs: 0, vents: 0, autoBridge: true }));
    expect(on.report.islandsFound).toBe(1);
    expect(on.report.islandsBridged).toBe(1);
    expect(on.report.islandsRemaining).toBe(0);
    const res = generateTealightShade(img, P({ ribs: 0, vents: 0, autoBridge: true }));
    expect(res.report.check.watertight).toBe(true);
  });
});

describe('validation', () => {
  it('rejects bad inputs with inline messages', () => {
    expect(validateTealightParams(P({ innerDiameter: 40 })).join(' ')).toMatch(/Inner Diameter/);
    expect(validateTealightParams(P({ flameHeight: 80 })).join(' ')).toMatch(/Flame Height/);
    expect(validateTealightParams(P({ shadowRadius: 20 })).join(' ')).toMatch(/Shadow Radius/);
    expect(validateTealightParams(P())).toEqual([]);
  });
});

describe('LED socket + vents + ribs', () => {
  it('produces a watertight shade in LED mode', () => {
    const img = TEALIGHT_SAMPLES[0].make(512);
    const p = P({ useLed: true, vents: 0 });
    const res = generateTealightShade(img, p);
    expect(res.report.check.errors).toEqual([]);
    expect(res.report.check.signedVolume).toBeGreaterThan(0);
  });
  it('rests on z = 0 and fits a 1M triangle budget at 360 cols', () => {
    const res = generateTealightShade(TEALIGHT_SAMPLES[0].make(512), P());
    let minZ = Infinity;
    for (let i = 2; i < res.positions.length; i += 3) minZ = Math.min(minZ, res.positions[i]);
    expect(minZ).toBeCloseTo(0, 6);
    expect(res.triangleCount).toBeLessThan(1_000_000);
  });
});
