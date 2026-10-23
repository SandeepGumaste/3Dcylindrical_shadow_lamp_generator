/**
 * The flat strip's pattern grid: the Tealight field cut open at a bar (the seam), with a lock tab on the right end and
 * the bottom millimetre of the upright wall dropped (the ring floor stands in for it). Grid index i + cols * j, solid
 * where the value is above 0, like the upright field.
 */
import type { GrayImage } from '../types';
import {
  TealightParams, TealightGeometry, FieldReport, buildTealightField, coneRadius, ribAngleList,
} from './tealightShade';
import { FLAT, FlatStripParams, flatTealightParams, groundRow, rimRows } from './flatStrip';

export interface StripGrid {
  geometry: TealightGeometry;
  cols: number;          // baseCols + 1 (right end node) + tabCols
  baseCols: number;      // columns around the cone (geometry.cols)
  tabCols: number;       // lock tab columns after the right end
  zs: Float64Array;      // real wall heights of the kept rows (the upright heights, not shifted)
  field: Float32Array;
  dTheta: number;        // angle per column
  seamCol: number;       // upright column that became column 0
  row0: number;          // first upright row kept
  floorThickness: number; // height of the dropped bottom = ring floor thickness
  rimLo: number;         // first row (in this grid) strictly inside the top rim band
  fingerCols: number;    // columns the lock fingers add after the tab
  lock: LockLayout;
  report: FieldReport;
}

/** Inclusive grid cell range. */
export interface GridRect { i0: number; i1: number; j0: number; j1: number }
export interface LockLayout { fingers: GridRect[]; slits: GridRect[] }

const FINGER = { length: 4, width: 2, barbWidth: 3, barbLength: 1.2, slitWidth: 2.4, slitLength: 1, margin: 1, gap: 1 } as const;

/**
 * Cuts the seam lock into the grid's top rim rows: arrow-shaped fingers stick out of the tab's far edge, and matching
 * slits are cut into the left end so that, rolled, each finger tip lies over its slit (tab column C + k overlays left
 * column k). One finger when the rim is short, two when it is tall enough to stack them. Reallocates `grid.field`.
 */
export function applyLock(grid: StripGrid): LockLayout {
  const { baseCols: C, tabCols, dTheta, zs, rimLo } = grid;
  const g = grid.geometry;
  const rows = zs.length;
  const zLo = zs[rimLo], zHi = zs[rows - 1];
  const rim = zHi - zLo;
  const rMid = coneRadius(g.Rb, g.k, (zLo + zHi) / 2);
  const cell = dTheta * rMid;                       // mm per column in the rim
  const fingerCols = Math.ceil(FINGER.length / cell);
  const slitCols = Math.max(1, Math.round(FINGER.slitLength / cell));
  const n = Math.max(1, Math.min(2, Math.floor((rim - FINGER.margin) / (FINGER.barbWidth + FINGER.gap))));

  const cols = grid.cols + fingerCols;
  const field = new Float32Array(cols * rows).fill(-255);
  for (let j = 0; j < rows; j++) for (let i = 0; i < grid.cols; i++) field[i + cols * j] = grid.field[i + grid.cols * j];

  const rowOf = (z: number) => {
    let best = rimLo;
    for (let j = rimLo; j < rows; j++) if (Math.abs(zs[j] - z) < Math.abs(zs[best] - z)) best = j;
    return best;
  };
  const tipRolled = tabCols + fingerCols;           // tip column minus C
  const fingers: GridRect[] = [], slits: GridRect[] = [];
  for (let m = 0; m < n; m++) {
    const zc = zLo + ((m + 0.5) * rim) / n;
    let j0 = rows, j1 = -1;
    for (let k = 1; k <= fingerCols; k++) {
      const x = k * cell;                           // mm from the tab edge
      const half = x < FINGER.length - FINGER.barbLength
        ? FINGER.width / 2
        : FINGER.barbWidth / 2 - ((x - (FINGER.length - FINGER.barbLength)) / FINGER.barbLength) * (FINGER.barbWidth / 2 - 0.5);
      for (let j = rimLo; j < rows; j++) {
        if (Math.abs(zs[j] - zc) <= half) { field[C + tabCols + k + cols * j] = 255; j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
      }
    }
    fingers.push({ i0: C + tabCols + 1, i1: C + tabCols + fingerCols, j0, j1 });
    const sj0 = rowOf(zc - FINGER.slitWidth / 2), sj1 = rowOf(zc + FINGER.slitWidth / 2);
    const slit = { i0: tipRolled - slitCols + 1, i1: tipRolled, j0: Math.min(sj0, j0), j1: Math.max(sj1, j1) };
    for (let j = slit.j0; j <= slit.j1; j++) for (let i = slit.i0; i <= slit.i1; i++) field[i + cols * j] = -255;
    slits.push(slit);
  }

  grid.field = field;
  grid.cols = cols;
  grid.fingerCols = fingerCols;
  return { fingers, slits };
}

const angDist = (a: number, b: number) => {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
};

/** The column to cut at: the centre of the rib nearest angle 0, or without ribs the most solid column of the pattern. */
export function chooseSeamColumn(field: Float32Array, g: TealightGeometry, p: TealightParams): number {
  const C = g.cols;
  const angles = p.ribs > 0 ? ribAngleList(p) : [];
  if (angles.length) {
    let best = angles[0];
    for (const a of angles) if (angDist(a, 0) < angDist(best, 0)) best = a;
    const a = ((best % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return Math.round((a * C) / (2 * Math.PI)) % C;
  }
  let bestCol = 0, bestCount = -1;
  for (let i = 0; i < C; i++) {
    let n = 0;
    for (let j = g.bandStart; j <= g.bandEnd; j++) if (field[i + C * j] > 0) n++;
    if (n > bestCount) { bestCount = n; bestCol = i; }
  }
  return bestCol;
}

export function buildStripGrid(img: GrayImage, p: TealightParams, fp: FlatStripParams): StripGrid {
  const tp = flatTealightParams(p, fp);
  const { geometry: g, field, report } = buildTealightField(img, tp);
  const C = g.cols;
  const dTheta = (2 * Math.PI) / C;
  const seamCol = chooseSeamColumn(field, g, tp);
  const row0 = groundRow(g);
  const rimLoFull = rimRows(g);
  const rowsKept = g.zs.length - row0;

  const zRim = (g.zs[rimLoFull - 1] + g.H) / 2;
  const tabCols = Math.ceil(FLAT.tabWidth / (dTheta * coneRadius(g.Rb, g.k, zRim)));
  const cols = C + 1 + tabCols;

  const out = new Float32Array(cols * rowsKept);
  for (let j = 0; j < rowsKept; j++) {
    const jf = row0 + j;
    for (let i = 0; i < cols; i++) {
      const v = field[((seamCol + i) % C) + C * jf];
      out[i + cols * j] = i > C && jf < rimLoFull ? -255 : v;
    }
  }

  const grid: StripGrid = {
    geometry: g, cols, baseCols: C, tabCols,
    zs: g.zs.slice(row0), field: out, dTheta, seamCol, row0,
    floorThickness: g.zs[row0], rimLo: rimLoFull - row0, fingerCols: 0, lock: { fingers: [], slits: [] }, report,
  };
  grid.lock = applyLock(grid);
  return grid;
}
