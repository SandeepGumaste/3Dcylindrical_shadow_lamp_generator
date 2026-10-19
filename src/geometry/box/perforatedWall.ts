import cdt2d from 'cdt2d';
import { extractSmoothLoops, groupShapes } from '../contours';
import { MeshBuilder } from '../shellMesh';
import { KIT, type WallId } from './kitSpec';
import type { PlateField } from './plateField';
import type { IndexedMesh } from './stlParse';
import { addBox } from './wallMesh';

/** How far a tab reaches down into the plate so the two solids fuse when sliced. */
const TAB_EMBED = 0.5;

/**
 * A wall plate with openings, in the same plate frame as `generateWall`: x height from the seat edge
 * (from `maxHeight` for the long walls), y along the length, z through the 3 mm plate, tabs on the +z
 * face. The outline and the openings are the smoothed boundaries of the solid cells, triangulated with
 * a constrained Delaunay triangulation; the side faces are built from the top face's boundary edges, so
 * every edge is shared by exactly two faces and the mesh is closed.
 */
export function generatePerforatedWall(id: WallId, field: PlateField): IndexedMesh {
  const spec = KIT.walls[id];
  const T = KIT.plateThickness;
  const { cols, rows, solid } = field;
  const pitchY = spec.length / cols, pitchH = spec.maxHeight / rows;
  const mb = new MeshBuilder();

  const toPlate = (c: number, r: number): [number, number] => {
    const hs = r * pitchH;
    return [spec.attachAtMax ? spec.maxHeight - hs : hs, c * pitchY]; // [x, y]
  };

  /**
   * The cell grid quantises the top edge to whole rows (0.4 mm), which perspective stretches into steps of
   * centimetres on the wall. Vertices on the top boundary are moved onto the exact rim profile instead.
   */
  const snapTop = (loop: [number, number][]): [number, number][] => {
    const topHs = field.topHs;
    if (!topHs) return loop;
    const topAt = (c: number) => {
      const f = Math.min(Math.max(c - 0.5, 0), cols - 1.0001), i = Math.floor(f);
      return topHs[i] + (topHs[i + 1] - topHs[i]) * (f - i);
    };
    const on = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols && solid[r * cols + c] === 1;
    const out: [number, number][] = [];
    for (const [c, r] of loop) {
      const ci = Math.round(c), ri = Math.round(r);
      const aboveOpen = !on(ri, ci - 1) || !on(ri, ci), belowSolid = on(ri - 1, ci - 1) || on(ri - 1, ci);
      const exact = topAt(c) / pitchH;
      const p: [number, number] = aboveOpen && belowSolid && Math.abs(r - exact) <= 1.25 ? [c, exact] : [c, r];
      const last = out[out.length - 1];
      if (!last || Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) out.push(p); // stair-step corners collapse onto one point
    }
    const first = out[0], end = out[out.length - 1];
    if (out.length > 1 && Math.abs(first[0] - end[0]) < 1e-9 && Math.abs(first[1] - end[1]) < 1e-9) out.pop();
    return out;
  };

  for (const shape of groupShapes(extractSmoothLoops(solid, cols, rows))) {
    const grid: [number, number][] = []; // triangulated in cell units: far faster than in millimetres, whose float pitches defeat the exact-arithmetic shortcuts
    const edges: [number, number][] = [];
    for (const raw of [shape.outer, ...shape.holes]) {
      const loop = snapTop(raw);
      if (loop.length < 3) continue;
      const first = grid.length;
      for (const [c, r] of loop) grid.push([c, r]);
      for (let i = 0; i < loop.length; i++) edges.push([first + i, first + ((i + 1) % loop.length)]);
    }
    const pts = grid.map(([c, r]) => toPlate(c, r));
    const tris = cdt2d(grid, edges, { exterior: false });
    const top = pts.map(([x, y]) => mb.vertex(x, y, T));
    const bottom = pts.map(([x, y]) => mb.vertex(x, y, 0));
    const directed = new Set<number>();
    const key = (a: number, b: number) => a * pts.length + b;
    const oriented: [number, number, number][] = [];
    for (const [a, b, c] of tris) {
      const cross = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
      const t: [number, number, number] = cross >= 0 ? [a, b, c] : [a, c, b]; // counter-clockwise seen from +z
      oriented.push(t);
      directed.add(key(t[0], t[1])); directed.add(key(t[1], t[2])); directed.add(key(t[2], t[0]));
    }
    for (const [a, b, c] of oriented) {
      mb.tri(top[a], top[b], top[c]);
      mb.tri(bottom[a], bottom[c], bottom[b]);
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        if (!directed.has(key(v, u))) mb.quad(top[v], top[u], bottom[u], bottom[v]); // boundary edge: wall facing outwards
      }
    }
  }
  for (const f of spec.features) addBox(mb, f.x0, f.x1, f.y0, f.y1, f.z0 - TAB_EMBED, f.z1);
  return mb.toArrays();
}
