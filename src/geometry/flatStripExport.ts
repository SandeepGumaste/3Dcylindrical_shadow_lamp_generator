/**
 * Flat strip export: the unrolled sheet and the base ring in one mesh, laid side by side on the bed.
 */
import { MeshBuilder, buildShell } from './shellMesh';
import { developedMap } from './flatStrip';
import type { StripGrid } from './flatStripGrid';

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
