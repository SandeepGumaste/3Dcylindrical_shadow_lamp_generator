/**
 * Shadow wall base plate: a solid plate under the wall (z in [-thickness, 0]) with a centre hole for the
 * light and optional magnet pockets on the underside. Same idea as Tealight's floor: the shell's bottom
 * ring edges are shared with the plate, so the whole model stays one closed manifold. Faces with holes
 * are triangulated with a constrained Delaunay triangulation that uses the ring vertices themselves.
 */
import cdt2d from 'cdt2d';
import type { MeshBuilder } from '../shellMesh';
import type { Outline } from './footprint';

export interface BaseSpec {
  thickness: number;      // mm
  holeDiameter: number;   // mm, centre hole for the light (0 = none)
  magnets: boolean;
  magnetDiameter: number; // mm
  magnetDepth: number;    // mm, from the underside
  magnetOffset: number;   // mm, pockets at (0, +offset) and (0, -offset)
}

const SIDES = 64;
const MIN_HOLE = 4;
const MIN_PLATE_ABOVE_POCKET = 0.4;
const CLEARANCE = 1;

/** Counter-clockwise circle polygon (seen from above), vertices at angles 2 pi k / SIDES. */
function circle(mb: MeshBuilder, cx: number, cy: number, r: number, z: number): Int32Array {
  const ring = new Int32Array(SIDES);
  for (let k = 0; k < SIDES; k++) {
    const a = (2 * Math.PI * k) / SIDES;
    ring[k] = mb.vertex(cx + r * Math.cos(a), cy + r * Math.sin(a), z);
  }
  return ring;
}

/**
 * Triangulates the region inside `outer` minus the `holes` (all vertex rings of `mb`, counter-clockwise
 * seen from above, at constant z) and adds the triangles facing up (`up`) or down.
 */
function addFace(mb: MeshBuilder, outer: ArrayLike<number>, holes: ArrayLike<number>[], up: boolean): void {
  const ids: number[] = [];
  const edges: [number, number][] = [];
  for (const ring of [outer, ...holes]) {
    const first = ids.length;
    for (let i = 0; i < ring.length; i++) {
      ids.push(ring[i]);
      edges.push([first + i, first + ((i + 1) % ring.length)]);
    }
  }
  const pos = mb.positions;
  const pts = ids.map((v): [number, number] => [pos[3 * v], pos[3 * v + 1]]);
  for (const [a, b, c] of cdt2d(pts, edges, { exterior: false })) {
    const cross = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
    if (cross === 0) continue;
    const ccw = cross > 0;
    if (ccw === up) mb.tri(ids[a], ids[b], ids[c]); else mb.tri(ids[a], ids[c], ids[b]);
  }
}

/** Cylinder wall between two rings (same xy), facing the axis (the void inside a hole). */
function addInnerWall(mb: MeshBuilder, bottom: Int32Array, top: Int32Array): void {
  for (let i = 0; i < bottom.length; i++) {
    const j = (i + 1) % bottom.length;
    mb.quad(bottom[i], top[i], top[j], bottom[j]);
  }
}

/** Adds the plate to `mb` (z in [-thickness, 0]); the mesh stays one closed manifold with the shell. */
export function addBase(mb: MeshBuilder, bottomInner: Int32Array, bottomOuter: Int32Array, spec: BaseSpec): void {
  const T = spec.thickness;
  const C = bottomOuter.length;
  const pos = mb.positions;
  const rim = new Int32Array(C);
  for (let i = 0; i < C; i++) rim[i] = mb.vertex(pos[3 * bottomOuter[i]], pos[3 * bottomOuter[i] + 1], -T);

  // Plate side, facing out (shares the shell's outer bottom ring).
  for (let i = 0; i < C; i++) {
    const j = (i + 1) % C;
    mb.quad(bottomOuter[i], rim[i], rim[j], bottomOuter[j]);
  }

  const topHoles: Int32Array[] = [];
  const underHoles: Int32Array[] = [];
  if (spec.holeDiameter > 0) {
    const r = spec.holeDiameter / 2;
    const top = circle(mb, 0, 0, r, 0), bottom = circle(mb, 0, 0, r, -T);
    addInnerWall(mb, bottom, top);
    topHoles.push(top);
    underHoles.push(bottom);
  }
  if (spec.magnets) {
    const r = spec.magnetDiameter / 2;
    for (const cy of [spec.magnetOffset, -spec.magnetOffset]) {
      const bottom = circle(mb, 0, cy, r, -T), top = circle(mb, 0, cy, r, -T + spec.magnetDepth);
      addInnerWall(mb, bottom, top);
      const centre = mb.vertex(0, cy, -T + spec.magnetDepth);
      for (let k = 0; k < SIDES; k++) mb.tri(centre, top[(k + 1) % SIDES], top[k]); // ceiling, facing down
      underHoles.push(bottom);
    }
  }
  addFace(mb, bottomInner, topHoles, true);
  addFace(mb, rim, underHoles, false);
}

/** Distance from (x, y) to the closed polygon's boundary, negative when the point is outside. */
function signedDistance(qx: Float64Array, qy: Float64Array, x: number, y: number): number {
  const n = qx.length;
  let d = Infinity, inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ex = qx[i] - qx[j], ey = qy[i] - qy[j];
    const t = Math.min(1, Math.max(0, ((x - qx[j]) * ex + (y - qy[j]) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(x - (qx[j] + t * ex), y - (qy[j] + t * ey)));
    if (qy[i] > y !== qy[j] > y && x < qx[j] + ((y - qy[j]) / (qy[i] - qy[j])) * ex) inside = !inside;
  }
  return inside ? d : -d;
}

export function validateBase(spec: BaseSpec, outline: Outline): string[] {
  const e: string[] = [];
  if (!(spec.thickness >= 0.4 && spec.thickness <= 10)) e.push('Base Thickness must be between 0.4 and 10 mm.');
  let minR = Infinity;
  for (let i = 0; i < outline.cols; i++) minR = Math.min(minR, outline.dIn[i]);
  const maxHole = (minR - 2) * 2;
  if (!(spec.holeDiameter >= MIN_HOLE)) e.push(`Base Hole Diameter must be at least ${MIN_HOLE} mm.`);
  else if (spec.holeDiameter > maxHole)
    e.push(`Base Hole Diameter is too big for this shape: at most ${Math.max(0, maxHole).toFixed(1)} mm.`);
  if (spec.magnets) {
    const r = spec.magnetDiameter / 2;
    if (!(spec.magnetDiameter > 0)) e.push('Magnet Diameter must be positive.');
    if (!(spec.magnetDepth > 0)) e.push('Magnet Depth must be positive.');
    else if (spec.magnetDepth > spec.thickness - MIN_PLATE_ABOVE_POCKET)
      e.push(`Magnet pockets are too deep: at most ${Math.max(0, spec.thickness - MIN_PLATE_ABOVE_POCKET).toFixed(1)} mm for this Base Thickness.`);
    if (spec.magnetDiameter > 0) {
      const off = Math.abs(spec.magnetOffset);
      for (const cy of [off, -off])
        if (signedDistance(outline.qx, outline.qy, 0, cy) < r + CLEARANCE) {
          e.push(`Magnet pockets must lie at least ${CLEARANCE} mm inside the wall: reduce Magnet Offset or Magnet Diameter, or enlarge the shape.`);
          break;
        }
      if (spec.holeDiameter > 0 && off - r - spec.holeDiameter / 2 < CLEARANCE)
        e.push(`Magnet pockets must be at least ${CLEARANCE} mm clear of the centre hole: increase Magnet Offset or reduce a diameter.`);
      if (2 * off - 2 * r < CLEARANCE)
        e.push(`The two magnet pockets must be at least ${CLEARANCE} mm clear of each other: increase Magnet Offset or reduce Magnet Diameter.`);
    }
  }
  return e;
}
