import { describe, it, expect } from 'vitest';
import { DEFAULT_TEALIGHT_PARAMS, TealightParams, buildTealightField } from '../tealightShade';
import { DEFAULT_FLAT_STRIP_PARAMS, flatTealightParams, groundRow } from '../flatStrip';
import { chooseSeamColumn, buildStripGrid } from '../flatStripGrid';
import { asymmetricTestImage } from '../../image/tealightSamples';

const P = (o: Partial<TealightParams> = {}): TealightParams => ({ ...DEFAULT_TEALIGHT_PARAMS, ...o });
const F = DEFAULT_FLAT_STRIP_PARAMS;
const img = asymmetricTestImage(256);

describe('chooseSeamColumn', () => {
  it('sits on the rib nearest angle 0', () => {
    const p = flatTealightParams(P(), F);
    const { geometry: g, field } = buildTealightField(img, p);
    expect(chooseSeamColumn(field, g, p)).toBe(0);
    const q = P({ ribs: 4, ribAngles: [0.4, 1.9, 3.4, 4.9] });
    const { geometry: g2, field: f2 } = buildTealightField(img, { ...q, ribAngles: undefined });
    expect(chooseSeamColumn(f2, g2, q)).toBe(Math.round((0.4 * g2.cols) / (2 * Math.PI)));
  });

  it('without ribs still picks a column, and the strip is built', () => {
    const p = flatTealightParams(P({ ribs: 0 }), F);
    const { geometry: g, field } = buildTealightField(img, p);
    const col = chooseSeamColumn(field, g, p);
    expect(col).toBeGreaterThanOrEqual(0);
    expect(col).toBeLessThan(g.cols);
    expect(buildStripGrid(img, P({ ribs: 0 }), F).cols).toBeGreaterThan(g.cols);
  });
});

describe('buildStripGrid', () => {
  const p = P({ ribs: 4, ribAngles: [0.4, 1.9, 3.4, 4.9] });
  const tp = flatTealightParams(p, F);
  const { geometry: g, field } = buildTealightField(img, tp);
  const grid = buildStripGrid(img, p, F);
  const C = g.cols;
  const row0 = groundRow(g);
  const seam = grid.seamCol;

  it('rotates the field so the seam column is first and the right end repeats it', () => {
    expect(grid.baseCols).toBe(C);
    for (let j = 0; j < g.zs.length - row0; j += 7)
      for (let i = 0; i <= C; i += 11) expect(grid.field[i + grid.cols * j]).toBe(field[((seam + i) % C) + C * (row0 + j)]);
    for (let j = 0; j < g.zs.length - row0; j++) expect(grid.field[C + grid.cols * j]).toBe(grid.field[grid.cols * j]);
  });

  it('adds a tab that is solid only in the top rim rows', () => {
    expect(grid.tabCols).toBeGreaterThan(10);
    for (let i = C + 1; i <= C + grid.tabCols; i++)
      for (let j = 0; j < g.zs.length - row0; j += 3) {
        const v = grid.field[i + grid.cols * j];
        if (j < grid.rimLo) expect(v).toBeLessThanOrEqual(0); else expect(v).toBeGreaterThan(0);
      }
  });

  it('drops the bottom millimetre and reports the ring floor', () => {
    expect(grid.floorThickness).toBeGreaterThanOrEqual(1);
    expect(grid.floorThickness).toBeLessThan(2);
    expect(grid.zs[0]).toBeCloseTo(g.zs[row0], 9);
    expect(grid.zs.length).toBe(g.zs.length - row0);
    expect(grid.field.length).toBe(grid.cols * grid.zs.length);
  });
});
