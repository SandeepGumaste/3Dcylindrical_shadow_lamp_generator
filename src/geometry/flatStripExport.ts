/**
 * Flat strip export: the unrolled sheet and the base ring in one mesh, laid side by side on the bed.
 */
import type { GrayImage } from '../types';
import { MeshBuilder, buildShell } from './shellMesh';
import { checkMesh, MeshCheck } from './meshCheck';
import { TealightParams, FieldReport, coneRadius } from './tealightShade';
import { FLAT, FlatStripParams, developedMap, sheetThickness, validateFlatStrip } from './flatStrip';
import { StripGrid, buildStripGrid } from './flatStripGrid';
import { buildRingMesh } from './flatRing';

/**
 * Meshes the strip grid as a thin sheet (inner face z = 0, outer face z = thickness) through the developed-cone map and
 * moves it so its bounding box starts at (0, 0). Returns the sheet's width and height in mm.
 */
export function buildSheetMesh(mb: MeshBuilder, grid: StripGrid, thickness: number): { width: number; height: number } {
  const map = developedMap(grid.geometry);
  const first = mb.positions.length;
  buildShell(mb, {
    cols: grid.cols,
    zs: grid.zs,
    field: grid.field,
    inner: (th, z) => { const [x, y] = map(th, z); return [x, y, 0]; },
    outer: (th, z) => { const [x, y] = map(th, z); return [x, y, thickness]; },
  }, { wrap: false, dTheta: grid.dTheta });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let v = first; v < mb.positions.length; v += 3) {
    x0 = Math.min(x0, mb.positions[v]); x1 = Math.max(x1, mb.positions[v]);
    y0 = Math.min(y0, mb.positions[v + 1]); y1 = Math.max(y1, mb.positions[v + 1]);
  }
  for (let v = first; v < mb.positions.length; v += 3) { mb.positions[v] -= x0; mb.positions[v + 1] -= y0; }
  return { width: x1 - x0, height: y1 - y0 };
}

export interface FlatStripResult {
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  check: MeshCheck;
  warnings: string[];
  ms: number;
  stripWidth: number;
  stripHeight: number;
  ringDiameter: number;
  report: FieldReport;
}

/** The unrolled sheet and the base ring in one mesh, side by side on z = 0. Throws when the settings are invalid. */
export function generateFlatStripExport(img: GrayImage, p: TealightParams, fp: FlatStripParams, runChecks = true): FlatStripResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const errors = validateFlatStrip(p, fp);
  if (errors.length) throw new Error(errors.join(' '));

  const grid = buildStripGrid(img, p, fp);
  const t = sheetThickness(fp);
  const mb = new MeshBuilder();
  const size = buildSheetMesh(mb, grid, t);
  const g = grid.geometry;
  const ringSpec = { grooveRadius: coneRadius(g.Rb, g.k, grid.zs[0]) + t / 2, sheetThickness: t, floor: grid.floorThickness };
  const outerRadius = coneRadius(g.Rb, g.k, grid.zs[0]) + t / 2 + (t + FLAT.grooveClearance) / 2 + FLAT.ringWallOut;
  buildRingMesh(mb, { ...ringSpec, cx: size.width + FLAT.bedGap + outerRadius, cy: outerRadius });

  const { positions, indices } = mb.toArrays();
  const check = runChecks
    ? checkMesh(positions, indices)
    : { triangleCount: indices.length / 3, watertight: true, badEdges: 0, degenerateTriangles: 0, signedVolume: 0, errors: [] };

  const report = grid.report;
  const warnings: string[] = [];
  if (report.islandsRemaining > 0)
    warnings.push(`${report.islandsRemaining} solid island(s) are not attached to the strip and would fall out.`);
  else if (report.islandsFound > 0 && p.autoBridge)
    warnings.push(`${report.islandsFound} floating solid island(s) were bridged with thin strips.`);
  else if (report.islandsFound > 0)
    warnings.push(`${report.islandsFound} solid island(s) are not attached; enable auto-bridge or add ribs.`);
  if (p.minFeature > 0 && report.specksRemoved > 0)
    warnings.push(`${report.specksRemoved} feature(s) smaller than ${p.minFeature} mm were dropped.`);
  const totalWidth = size.width + FLAT.bedGap + 2 * outerRadius;
  if (totalWidth > FLAT.bedMax || size.height > FLAT.bedMax || 2 * outerRadius > FLAT.bedMax)
    warnings.push(`Strip and ring need ${totalWidth.toFixed(0)} x ${Math.max(size.height, 2 * outerRadius).toFixed(0)} mm on the bed; check your printer fits ${FLAT.bedMax} mm.`);

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    positions, indices, triangleCount: indices.length / 3, check, warnings, ms: t1 - t0,
    stripWidth: size.width, stripHeight: size.height, ringDiameter: 2 * outerRadius, report,
  };
}
