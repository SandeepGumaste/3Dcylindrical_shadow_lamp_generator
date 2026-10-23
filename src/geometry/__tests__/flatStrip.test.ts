import { describe, it, expect } from 'vitest';
import { DEFAULT_TEALIGHT_PARAMS, TealightParams, deriveGeometry, coneRadius } from '../tealightShade';
import {
  DEFAULT_FLAT_STRIP_PARAMS, FlatStripParams, FLAT, sheetThickness, flatTealightParams, validateFlatStrip, developedMap, rimRows,
} from '../flatStrip';

const P = (o: Partial<TealightParams> = {}): TealightParams => ({ ...DEFAULT_TEALIGHT_PARAMS, ...o });
const F = (o: Partial<FlatStripParams> = {}): FlatStripParams => ({ ...DEFAULT_FLAT_STRIP_PARAMS, ...o });

describe('developedMap', () => {
  it('keeps arc length around and slant length up', () => {
    const g = deriveGeometry(P());
    const map = developedMap(g);
    const d = 0.05;
    for (let n = 0; n < 20; n++) {
      const z = (g.H * n) / 20, th = 0.3 * n;
      const a = map(th, z), b = map(th + d, z);
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(coneRadius(g.Rb, g.k, z) * d, 3);
      const z1 = z + 0.5;
      const c = map(th, z1);
      expect(Math.hypot(c[0] - a[0], c[1] - a[1])).toBeCloseTo(0.5 * Math.sqrt(1 + g.k * g.k), 6);
    }
  });

  it('is a plain rectangle for a cylinder', () => {
    const g = deriveGeometry(P({ topDiameter: 44 }));
    const [x, y] = developedMap(g)(1.25, 7);
    expect(x).toBeCloseTo(g.Rb * (1.25 - Math.PI), 9);
    expect(y).toBeCloseTo(7, 9);
  });
});

describe('validateFlatStrip', () => {
  it('accepts the defaults', () => {
    expect(validateFlatStrip(P(), F())).toEqual([]);
  });
  it('rejects LED mode', () => {
    expect(validateFlatStrip(P({ useLed: true }), F()).join(' ')).toContain('LED');
  });
  it('rejects a sheet too thick to bend', () => {
    expect(validateFlatStrip(P(), F({ layers: 7 })).join(' ')).toContain('bend');
  });
  it('rejects a rim shorter than the lock needs', () => {
    const p = P({ height: 16, flameHeight: 12, patternGapTop: 5 });
    const g = deriveGeometry(flatTealightParams(p, F()));
    expect(g.H - g.zs[rimRows(g) - 1]).toBeLessThan(FLAT.lockRimMin);
    expect(validateFlatStrip(p, F()).join(' ')).toContain('rim');
  });
  it('default rim is tall enough and the sheet is 0.4 mm', () => {
    const g = deriveGeometry(flatTealightParams(P(), F()));
    expect(g.H - g.zs[rimRows(g) - 1]).toBeGreaterThanOrEqual(FLAT.lockRimMin);
    expect(sheetThickness(F())).toBeCloseTo(0.4, 9);
  });
});
