import { describe, it, expect } from 'vitest';
import { DEFAULT_TEALIGHT_PARAMS, TealightParams, buildTealightField } from '../tealightShade';
import { DEFAULT_FLAT_STRIP_PARAMS, FLAT, flatTealightParams, groundRow } from '../flatStrip';
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
    for (let j = 0; j < grid.rimLo; j += 7)
      for (let i = 0; i <= C; i += 11) expect(grid.field[i + grid.cols * j]).toBe(field[((seam + i) % C) + C * (row0 + j)]);
    for (let j = 0; j < grid.rimLo; j++) expect(grid.field[C + grid.cols * j]).toBe(grid.field[grid.cols * j]);
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

describe('seam lock', () => {
  const grid = buildStripGrid(img, P(), F);
  const { lock } = grid;
  const rows = grid.zs.length;

  it('has one slit per finger, all in the top rim rows', () => {
    expect(lock.fingers.length).toBeGreaterThanOrEqual(1);
    expect(lock.slits.length).toBe(lock.fingers.length);
    for (const r of [...lock.fingers, ...lock.slits]) {
      expect(r.j0).toBeGreaterThanOrEqual(grid.rimLo);
      expect(r.j1).toBeLessThan(rows);
    }
  });

  it('lands each finger tip over its slit when rolled', () => {
    lock.fingers.forEach((f, n) => {
      const s = lock.slits[n];
      const tip = f.i1 - grid.baseCols;
      expect(tip).toBeGreaterThanOrEqual(s.i0);
      expect(tip).toBeLessThanOrEqual(s.i1);
      expect(s.j0).toBeLessThanOrEqual(f.j0);
      expect(s.j1).toBeGreaterThanOrEqual(f.j1);
    });
  });

  it('cuts the slits open and fills the fingers along their centre row', () => {
    const at = (i: number, j: number) => grid.field[i + grid.cols * j];
    lock.slits.forEach((s) => { for (let j = s.j0; j <= s.j1; j++) for (let i = s.i0; i <= s.i1; i++) expect(at(i, j)).toBeLessThanOrEqual(0); });
    lock.fingers.forEach((f) => {
      const jc = Math.round((f.j0 + f.j1) / 2);
      for (let i = f.i0; i <= f.i1; i++) expect(at(i, jc)).toBeGreaterThan(0);
    });
  });

  it('keeps fingers apart and leaves the pattern rows alone', () => {
    const f = lock.fingers;
    for (let a = 0; a < f.length; a++) for (let b = a + 1; b < f.length; b++) expect(f[a].j1 < f[b].j0 || f[b].j1 < f[a].j0).toBe(true);
    const tp = flatTealightParams(P(), F);
    const { field } = buildTealightField(img, tp);
    const C = grid.baseCols;
    for (let j = 0; j < grid.rimLo; j++) for (let i = 0; i <= C; i++)
      expect(grid.field[i + grid.cols * j]).toBe(field[((grid.seamCol + i) % C) + C * (grid.row0 + j)]);
  });

  it('puts two fingers in a tall rim (the default) and one in a short rim', () => {
    expect(lock.fingers.length).toBe(2);
    const short = buildStripGrid(img, P({ height: 24, flameHeight: 20, patternGapTop: 0 }), F);
    expect(short.lock.fingers.length).toBe(1);
  });
});

describe('seam lock with the LED socket ring', () => {
  it('keeps tab, fingers and slits below the socket groove', () => {
    const grid = buildStripGrid(img, P({ useLed: true }), F);
    const limit = grid.geometry.H - FLAT.grooveDepth - FLAT.socketClearance;
    for (const r of [...grid.lock.fingers, ...grid.lock.slits]) expect(grid.zs[r.j1]).toBeLessThanOrEqual(limit + 1e-9);
    for (let i = grid.baseCols + 1; i < grid.cols; i++)
      for (let j = 0; j < grid.zs.length; j++) if (grid.zs[j] > limit) expect(grid.field[i + grid.cols * j]).toBeLessThanOrEqual(0);
    expect(grid.lock.fingers.length).toBeGreaterThanOrEqual(1);
  });
});
