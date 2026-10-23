import { describe, it, expect } from 'vitest';
import { DEFAULT_TEALIGHT_PARAMS, TealightParams } from '../tealightShade';
import { DEFAULT_FLAT_STRIP_PARAMS, sheetThickness } from '../flatStrip';
import { buildStripGrid } from '../flatStripGrid';
import { buildSheetMesh } from '../flatStripExport';
import { MeshBuilder } from '../shellMesh';
import { checkMesh } from '../meshCheck';
import { asymmetricTestImage } from '../../image/tealightSamples';

const P = (o: Partial<TealightParams> = {}): TealightParams => ({ ...DEFAULT_TEALIGHT_PARAMS, ...o });
const F = DEFAULT_FLAT_STRIP_PARAMS;
const img = asymmetricTestImage(256);

const sheet = (p: TealightParams) => {
  const grid = buildStripGrid(img, p, F);
  const mb = new MeshBuilder();
  const size = buildSheetMesh(mb, grid, sheetThickness(F));
  const { positions, indices } = mb.toArrays();
  return { grid, size, positions, indices, check: checkMesh(positions, indices) };
};

describe('buildSheetMesh', () => {
  for (const [name, o] of [['default cone', {}], ['cylinder', { topDiameter: 44 }], ['top wider', { topDiameter: 52 }]] as const) {
    it(`is a watertight outward-facing sheet: ${name}`, () => {
      const r = sheet(P(o));
      expect(r.check.watertight).toBe(true);
      expect(r.check.signedVolume).toBeGreaterThan(0);
      let zMin = Infinity, zMax = -Infinity, xMin = Infinity, yMin = Infinity;
      for (let v = 0; v < r.positions.length; v += 3) {
        xMin = Math.min(xMin, r.positions[v]); yMin = Math.min(yMin, r.positions[v + 1]);
        zMin = Math.min(zMin, r.positions[v + 2]); zMax = Math.max(zMax, r.positions[v + 2]);
      }
      expect(zMin).toBeCloseTo(0, 6);
      expect(zMax).toBeCloseTo(0.4, 5);
      expect(xMin).toBeCloseTo(0, 5);
      expect(yMin).toBeCloseTo(0, 5);
    });
  }

  it('is as wide as the cone is round plus the tab and fingers', () => {
    const r = sheet(P());
    expect(r.size.width).toBeGreaterThan(2 * Math.PI * 22 * 0.95);
    expect(r.size.width).toBeLessThan(2 * Math.PI * 22 + 40);
    expect(r.size.height).toBeGreaterThan(38);
  });
});
