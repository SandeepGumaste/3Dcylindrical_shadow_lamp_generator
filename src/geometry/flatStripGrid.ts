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
  report: FieldReport;
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

  return {
    geometry: g, cols, baseCols: C, tabCols,
    zs: g.zs.slice(row0), field: out, dTheta, seamCol, row0,
    floorThickness: g.zs[row0], rimLo: rimLoFull - row0, report,
  };
}
