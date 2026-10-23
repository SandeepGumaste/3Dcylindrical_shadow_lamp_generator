import { describe, it, expect } from 'vitest';
import { DEFAULT_TEALIGHT_PARAMS, TealightParams } from '../tealightShade';
import { DEFAULT_FLAT_STRIP_PARAMS, sheetThickness } from '../flatStrip';
import { buildStripGrid } from '../flatStripGrid';
import { buildSheetMesh, generateFlatStripExport } from '../flatStripExport';
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

describe('generateFlatStripExport', () => {
  const white = (v: number) => ({ width: 64, height: 64, pixels: new Float32Array(64 * 64).fill(v) });

  it('builds strip and ring side by side as one watertight mesh', () => {
    const r = generateFlatStripExport(img, P(), F);
    expect(r.check.watertight).toBe(true);
    expect(r.check.signedVolume).toBeGreaterThan(0);
    expect(r.warnings.filter((w) => w.includes('bed'))).toEqual([]);
    for (let v = 0; v < r.positions.length; v += 3) {
      const x = r.positions[v];
      expect(x <= r.stripWidth + 1e-4 || x >= r.stripWidth + 5 - 1e-4).toBe(true);
    }
    expect(r.stripHeight).toBeGreaterThan(38);
    expect(r.stripHeight).toBeLessThan(42 + 8); // the fan's curved edges add a few mm of sag to the bounding box
    expect(r.ringDiameter).toBeGreaterThan(44);
  });

  it('warns when the layout does not fit a bed', () => {
    const r = generateFlatStripExport(img, P({ innerDiameter: 200, topDiameter: 190, shadowRadius: 400 }), F, false);
    expect(r.warnings.join(' ')).toContain('bed');
  });

  it('adds a third part, the LED socket ring, in LED mode', () => {
    const plain = generateFlatStripExport(img, P(), F);
    const led = generateFlatStripExport(img, P({ useLed: true }), F);
    expect(plain.socketDiameter).toBeUndefined();
    expect(led.socketDiameter).toBeGreaterThan(38);
    expect(led.check.watertight).toBe(true);
    expect(led.check.signedVolume).toBeGreaterThan(plain.check.signedVolume);
    let xMax = -Infinity;
    for (let v = 0; v < led.positions.length; v += 3) xMax = Math.max(xMax, led.positions[v]);
    expect(xMax).toBeGreaterThan(led.stripWidth + 5 + led.ringDiameter + 5 + led.socketDiameter! - 1);
  });

  it('throws the validation errors', () => {
    expect(() => generateFlatStripExport(img, P({ useLed: true, topDiameter: 38 }), F)).toThrow('socket');
  });

  for (const [name, v] of [['blank white', 1], ['all black', 0]] as const) {
    it(`handles a ${name} image`, () => {
      const r = generateFlatStripExport(white(v), P(), F);
      expect(r.check.watertight).toBe(true);
      expect(r.check.signedVolume).toBeGreaterThan(0);
    });
  }
});
