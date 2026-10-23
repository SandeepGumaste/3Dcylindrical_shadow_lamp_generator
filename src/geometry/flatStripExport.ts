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
import { buildSocketMesh } from './flatSocket';

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

/** One printable part with its own origin, exported on its own as well as inside the combined plate. */
export interface FlatPart { id: string; positions: Float32Array; indices: Uint32Array }

/** Copies `src` into `dst` shifted by (dx, dy). */
function appendMesh(dst: MeshBuilder, src: MeshBuilder, dx: number, dy: number): void {
  const base = dst.positions.length / 3;
  for (let v = 0; v < src.positions.length; v += 3) dst.vertex(src.positions[v] + dx, src.positions[v + 1] + dy, src.positions[v + 2]);
  for (const i of src.indices) dst.indices.push(i + base);
}

export interface FlatStripResult {
  /** The strip, base ring and (LED mode) socket ring, each at its own origin. */
  parts: FlatPart[];
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  check: MeshCheck;
  warnings: string[];
  ms: number;
  stripWidth: number;
  stripHeight: number;
  ringDiameter: number;
  /** Diameter of the LED socket ring; only present in LED mode. */
  socketDiameter?: number;
  report: FieldReport;
}

/** All parts in one mesh on z = 0, ring(s) side by side above the strip. Throws when the settings are invalid. */
export function generateFlatStripExport(img: GrayImage, p: TealightParams, fp: FlatStripParams, runChecks = true): FlatStripResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const errors = validateFlatStrip(p, fp);
  if (errors.length) throw new Error(errors.join(' '));

  const grid = buildStripGrid(img, p, fp);
  const t = sheetThickness(fp);
  const g = grid.geometry;
  const ringSpec = { grooveRadius: coneRadius(g.Rb, g.k, grid.zs[0]) + t / 2, sheetThickness: t, floor: grid.floorThickness };
  const outerRadius = coneRadius(g.Rb, g.k, grid.zs[0]) + t / 2 + (t + FLAT.grooveClearance) / 2 + FLAT.ringWallOut;

  // each part is built on its own with its bounding box starting at (0, 0), so it can also be printed alone
  const stripMb = new MeshBuilder();
  const size = buildSheetMesh(stripMb, grid, t);
  const ringMb = new MeshBuilder();
  buildRingMesh(ringMb, { ...ringSpec, cx: outerRadius, cy: outerRadius });
  let socketMb: MeshBuilder | undefined;
  let socketDiameter: number | undefined;
  if (p.useLed) {
    socketMb = new MeshBuilder();
    // the socket ring is wider than the cone top, so its radius comes from the build itself
    const sock = buildSocketMesh(new MeshBuilder(), { g, p, sheetThickness: t }, 8);
    buildSocketMesh(socketMb, { g, p, sheetThickness: t }, 360, sock.outerRadius, sock.outerRadius);
    socketDiameter = 2 * sock.outerRadius;
  }

  // layout on the bed: the strip along the bottom, the ring and the socket ring side by side above it
  const rowHeight = Math.max(2 * outerRadius, socketDiameter ?? 0);
  const rowY = size.height + FLAT.bedGap;
  const mb = new MeshBuilder();
  appendMesh(mb, stripMb, 0, 0);
  appendMesh(mb, ringMb, 0, rowY + (rowHeight - 2 * outerRadius) / 2);
  if (socketMb) appendMesh(mb, socketMb, 2 * outerRadius + FLAT.bedGap, rowY + (rowHeight - socketDiameter!) / 2);
  const parts: FlatPart[] = [
    { id: 'strip', ...stripMb.toArrays() },
    { id: 'base-ring', ...ringMb.toArrays() },
    ...(socketMb ? [{ id: 'socket-ring', ...socketMb.toArrays() }] : []),
  ];

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
  const totalWidth = Math.max(size.width, 2 * outerRadius + (socketDiameter ? FLAT.bedGap + socketDiameter : 0));
  const tallest = size.height + FLAT.bedGap + rowHeight;
  if (totalWidth > FLAT.bedMax || tallest > FLAT.bedMax)
    warnings.push(`Parts need ${totalWidth.toFixed(0)} x ${tallest.toFixed(0)} mm on the bed; check your printer fits ${FLAT.bedMax} mm.`);

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    positions, indices, triangleCount: indices.length / 3, check, warnings, ms: t1 - t0,
    parts, stripWidth: size.width, stripHeight: size.height, ringDiameter: 2 * outerRadius, socketDiameter, report,
  };
}
