import { describe, it, expect } from 'vitest';
import { buildPlateField, bridgeFloatingPieces, PLATE_CELL, type PlateField } from '../plateField';
import { buildRimProfile, DEFAULT_BOX_PARAMS, MIN_WALL_HEIGHT, PROFILE_STEP, type BoxParams } from '../rimProfile';
import { KIT, WALL_IDS, type WallId } from '../kitSpec';
import { wallSpan } from '../shadowModel';
import type { GrayImage } from '../../../types';

const P = (o: Partial<BoxParams> = {}): BoxParams => ({ ...DEFAULT_BOX_PARAMS, ...o });
/** 450 px square, 1 px per mm at the default size; dark where `dark(xMm, yMm)` (light axis at the centre, y up). */
const raster = (dark: (x: number, y: number) => boolean, n = 450): GrayImage => {
  const pixels = new Float32Array(n * n).fill(1);
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) if (dark(px + 0.5 - n / 2, n / 2 - (py + 0.5))) pixels[py * n + px] = 0;
  return { width: n, height: n, pixels };
};
const field = (img: GrayImage, p = P()): PlateField => {
  const profile = buildRimProfile(img, p);
  return buildPlateField('w1', profile, p);
};
const at = (f: PlateField, c: number, r: number) => f.solid[r * f.cols + c];
/** Cells of the 4-connected region of `value` containing (c, r). */
function region(f: PlateField, c: number, r: number, value: number) {
  const seen = new Set<number>(), stack = [r * f.cols + c], cells: number[] = [];
  if (f.solid[stack[0]] !== value) return cells;
  seen.add(stack[0]);
  while (stack.length) {
    const i = stack.pop()!; cells.push(i);
    const x = i % f.cols, y = (i - x) / f.cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= f.cols || ny >= f.rows) continue;
      const j = ny * f.cols + nx;
      if (!seen.has(j) && f.solid[j] === value) { seen.add(j); stack.push(j); }
    }
  }
  return cells;
}
// Wall w1 stands at the top of the box; its plate column for position s along x is y = 120.15 - s.
const colOf = (s: number) => Math.round((120.15 - s) / PLATE_CELL);
const rowOf = (hAbovePanel: number) => Math.round((hAbovePanel + KIT.panelPlaneX) / PLATE_CELL);
// A lit patch of radius R straight above the light, inside a big dark disc, shows on w1 at s = 60:
// radius r from the light maps to height h = L - d (L + T) / r with d = 75, L = 45, T = 21.5.
const hFor = (r: number) => 45 - (75 * 66.5) / r;
const litPatch = (R: number, cy: number) => (x: number, y: number) => Math.hypot(x, y) < 250 && Math.hypot(x, y - cy) >= R;

describe('plate field', () => {
  it('keeps everything below the minimum wall height solid', () => {
    const f = field(raster(() => false));
    for (let r = 0; r * PLATE_CELL + PLATE_CELL / 2 < MIN_WALL_HEIGHT; r++) for (let c = 0; c < f.cols; c++) expect(at(f, c, r)).toBe(1);
  });

  it('cuts an opening where a lit patch sits inside the dark shape', () => {
    const f = field(raster(litPatch(20, 200)));
    const c = colOf(60), r = rowOf(hFor(200));
    expect(at(f, c, r)).toBe(0);
    const cells = region(f, c, r, 0);
    expect(cells.length).toBeGreaterThan(20);
    for (const i of cells) { const x = i % f.cols, y = (i - x) / f.cols; expect(x > 1 && x < f.cols - 2 && y > 1 && y < f.rows - 2).toBe(true); }
    expect(f.report.openings).toBe(1);
    const xs = cells.map((i) => i % f.cols), ys = cells.map((i) => Math.floor(i / f.cols));
    expect((Math.max(...ys) - Math.min(...ys) + 1) * PLATE_CELL).toBeGreaterThan(hFor(220) - hFor(180) - 1.2);
    expect((Math.max(...ys) - Math.min(...ys) + 1) * PLATE_CELL).toBeLessThan(hFor(220) - hFor(180) + 1.2);
    expect((Math.max(...xs) - Math.min(...xs) + 1) * PLATE_CELL).toBeGreaterThan(10);
  });

  it('cuts no openings for a solid dark shape', () => {
    const f = field(raster((x, y) => Math.hypot(x, y) < 250));
    expect(f.report.openings).toBe(0);
  });

  it('joins or drops a dark island inside a lit opening, never leaving it floating', () => {
    const img = raster((x, y) => (Math.hypot(x, y) < 250 && Math.hypot(x, y - 200) >= 30) || Math.hypot(x, y - 200) < 6);
    const f = field(img);
    expect(f.report.bridged + f.report.dropped).toBeGreaterThanOrEqual(1);
    const reached = new Set<number>();
    for (let c = 0; c < f.cols; c++) for (const i of region(f, c, 0, 1)) reached.add(i);
    for (let i = 0; i < f.solid.length; i++) if (f.solid[i] === 1) expect(reached.has(i)).toBe(true);
  });

  it('thickens a dark stroke thinner than the minimum spike width', () => {
    // a ring 8 mm wide in radius is only about 1 mm tall on the wall
    const f = field(raster((x, y) => { const r = Math.hypot(x, y); return r > 196 && r < 204; }));
    expect(f.report.thickened).toBeGreaterThanOrEqual(1);
    const c = colOf(60);
    let run = 0, best = 0;
    for (let r = rowOf(hFor(204)) + 6; r >= rowOf(hFor(196)) - 6; r--) { if (at(f, c, r)) run++; else { best = Math.max(best, run); run = 0; } }
    best = Math.max(best, run);
    expect(best * PLATE_CELL).toBeGreaterThanOrEqual(1.2 - PLATE_CELL);
  });

  it('removes openings narrower than the minimum notch width', () => {
    // a lit radial slit 0.5 mm wide is about 0.1 mm wide on the wall
    const f = field(raster((x, y) => Math.hypot(x, y) < 250 && !(Math.abs(x) < 0.3 && y > 170 && y < 230)));
    expect(f.report.openings).toBe(0);
    expect(at(f, colOf(60), rowOf(hFor(200)))).toBe(1);
  });

  describe('top edge', () => {
    const star = raster((x, y) => Math.hypot(x, y) < 160 + 50 * Math.cos(9 * Math.atan2(y, x)));
    const disc = raster((x, y) => Math.hypot(x, y) < 200);
    /** How far the plate's top rises above the rim profile at most, over the columns where `include(c, cols)` is true. Openings may lower it. */
    const topError = (id: WallId, img: GrayImage, include: (c: number, cols: number) => boolean = () => true) => {
      const p = P(), profile = buildRimProfile(img, p), f = buildPlateField(id, profile, p);
      const spec = KIT.walls[id], span = wallSpan(id);
      const pitchY = spec.length / f.cols, pitchH = spec.maxHeight / f.rows;
      let worst = 0;
      for (let c = 0; c < f.cols; c++) {
        if (!include(c, f.cols)) continue;
        let top = -1;
        for (let r = 0; r < f.rows; r++) if (f.solid[r * f.cols + c]) top = r;
        const s = Math.min(Math.max(spec.plan.from + spec.plan.dir * (c + 0.5) * pitchY, 0), span);
        const i = Math.min(Math.floor(s / PROFILE_STEP), profile.heights[id].length - 2), k = s / PROFILE_STEP - i;
        const expected = KIT.panelPlaneX + profile.heights[id][i] * (1 - k) + profile.heights[id][i + 1] * k;
        worst = Math.max(worst, (top + 1) * pitchH - expected);
      }
      return worst;
    };
    it.each(WALL_IDS)('never rises more than one cell above the rim profile on %s, ends included', (id) => {
      expect(topError(id, disc)).toBeLessThanOrEqual(PLATE_CELL + 0.02);
      // thin lobe tips are thickened on purpose, so for the star only the plate ends are compared
      expect(topError(id, star, (c, cols) => c < 4 || c >= cols - 4)).toBeLessThanOrEqual(PLATE_CELL + 0.02);
    });
  });

  it('joins a long floating piece with several bridges, not one', () => {
    // a lit band across the whole wall leaves everything above it hanging
    const f = field(raster((x, y) => { const r = Math.hypot(x, y); return r < 225 && !(r > 160 && r < 175); }));
    expect(f.report.bridged).toBeGreaterThanOrEqual(3);
    const reached = new Set<number>();
    for (let c = 0; c < f.cols; c++) for (const i of region(f, c, 0, 1)) reached.add(i);
    for (let i = 0; i < f.solid.length; i++) if (f.solid[i] === 1) expect(reached.has(i)).toBe(true);
  });

  it('does not report ordinary corners and tips as thin strokes', () => {
    expect(field(raster((x, y) => Math.hypot(x, y) < 200)).report.thickened).toBeLessThanOrEqual(2);
  });
});

describe('bridges for floating pieces', () => {
  const COLS = 160, ROWS = 70;
  /** A grid with a solid foot (rows 0 to 9) and the given solid rectangles [x0, x1, y0, y1], inclusive. */
  const grid = (rects: number[][]) => {
    const solid = new Uint8Array(COLS * ROWS);
    const fill = (x0: number, x1: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) solid[y * COLS + x] = 1; };
    fill(0, COLS - 1, 0, 9);
    for (const r of rects) fill(r[0], r[1], r[2], r[3]);
    return solid;
  };
  const bridgeCells = (solid: Uint8Array, x0: number, x1: number, y0: number, y1: number) => {
    const out: number[][] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid[y * COLS + x]) out.push([x, y]);
    return out;
  };

  it('joins a floating strip at the middle of its facing edge, not at an end', () => {
    // a strip 60 cells long hanging 10 cells above the foot: every point of its lower edge is equally close
    const solid = grid([[40, 99, 20, 23]]);
    expect(bridgeFloatingPieces(solid, COLS, ROWS, 3)).toBe(1);
    const cells = bridgeCells(solid, 0, COLS - 1, 10, 19);
    expect(cells.length).toBeGreaterThan(0);
    const xs = cells.map((c) => c[0]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...xs)).toBeLessThanOrEqual(80);
  });

  it('joins a piece at its nearest point, not at a far one', () => {
    // a near block 4 cells above the foot, and a long strip beside it that is 20 cells up
    const solid = grid([[30, 33, 14, 17]]);
    expect(bridgeFloatingPieces(solid, COLS, ROWS, 3)).toBe(1);
    expect(bridgeCells(solid, 28, 36, 10, 13).length).toBeGreaterThan(0);      // joined right under the block
  });

  it('puts one bridge on an ordinary piece, however sharp its ends', () => {
    const solid = grid([[40, 70, 20, 25], [40, 40, 14, 19]]);      // a block with a one-cell spike hanging from its corner
    expect(bridgeFloatingPieces(solid, COLS, ROWS, 3)).toBe(1);
  });

  it('keeps several bridges for a piece as long as the wall', () => {
    const solid = grid([[2, COLS - 3, 25, 40]]);
    expect(bridgeFloatingPieces(solid, COLS, ROWS, 3)).toBeGreaterThanOrEqual(2);
  });

  it('leaves a piece with nothing in reach for the caller to drop', () => {
    const rows = 200, solid = new Uint8Array(COLS * rows);
    for (let x = 0; x < COLS; x++) solid[x] = 1;
    for (let y = 150; y < 155; y++) for (let x = 40; x < 60; x++) solid[y * COLS + x] = 1;
    expect(bridgeFloatingPieces(solid, COLS, rows, 3)).toBe(0);
  });
});
