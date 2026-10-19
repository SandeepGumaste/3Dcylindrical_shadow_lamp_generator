import { MeshBuilder } from '../shellMesh';
import { KIT, type WallId } from './kitSpec';
import { PROFILE_STEP, type RimProfile } from './rimProfile';
import { wallSpan } from './shadowModel';
import type { IndexedMesh } from './stlParse';

/** How far a tab reaches down into the plate so the two solids fuse when sliced. */
const TAB_EMBED = 0.5;

/**
 * One wall plate in the original part's frame: x is the height direction (the seating edge is at
 * x = 0, or at x = maxHeight for the long walls), y the length, z the 3 mm thickness. The top edge
 * follows the rim profile; the tabs are boxes on the +z face. Closed and outward-facing.
 */
export function generateWall(id: WallId, profile: RimProfile): IndexedMesh {
  const spec = KIT.walls[id];
  const T = KIT.plateThickness;
  const span = wallSpan(id);
  const heights = profile.heights[id];
  const heightAt = (y: number) => {
    const s = Math.min(Math.max(spec.plan.from + spec.plan.dir * y, 0), span);
    const f = s / PROFILE_STEP, i = Math.min(Math.floor(f), heights.length - 2);
    return heights[i] + (heights[i + 1] - heights[i]) * (f - i);
  };
  const N = Math.round(spec.length / PROFILE_STEP);
  const xa = spec.attachAtMax ? spec.maxHeight : 0;
  const mb = new MeshBuilder();
  const A: number[][] = [], P: number[][] = []; // [bottom, top] vertex ids at the attach edge and along the profile
  for (let j = 0; j <= N; j++) {
    const y = j * PROFILE_STEP;
    const h = Math.min(heightAt(y), spec.maxHeight);
    const xt = spec.attachAtMax ? spec.maxHeight - h : h;
    A.push([mb.vertex(xa, y, 0), mb.vertex(xa, y, T)]);
    P.push([mb.vertex(xt, y, 0), mb.vertex(xt, y, T)]);
  }
  const flip = spec.attachAtMax;
  const quad = (a: number, b: number, c: number, d: number) => (flip ? mb.quad(a, d, c, b) : mb.quad(a, b, c, d));
  for (let j = 0; j < N; j++) {
    quad(A[j][1], P[j][1], P[j + 1][1], A[j + 1][1]); // top face (+z)
    quad(A[j][0], A[j + 1][0], P[j + 1][0], P[j][0]); // bottom face (-z)
    quad(P[j][0], P[j + 1][0], P[j + 1][1], P[j][1]); // profile edge
    quad(A[j][0], A[j][1], A[j + 1][1], A[j + 1][0]); // seating edge
  }
  quad(A[0][0], P[0][0], P[0][1], A[0][1]); // end at y = 0
  quad(A[N][0], A[N][1], P[N][1], P[N][0]); // end at y = length
  for (const f of spec.features) addBox(mb, f.x0, f.x1, f.y0, f.y1, f.z0 - TAB_EMBED, f.z1);
  return mb.toArrays();
}

function addBox(mb: MeshBuilder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const v = (x: number, y: number, z: number) => mb.vertex(x, y, z);
  const a = v(x0, y0, z0), b = v(x1, y0, z0), c = v(x1, y1, z0), d = v(x0, y1, z0);
  const e = v(x0, y0, z1), f = v(x1, y0, z1), g = v(x1, y1, z1), h = v(x0, y1, z1);
  mb.quad(a, d, c, b); mb.quad(e, f, g, h); mb.quad(a, b, f, e); mb.quad(b, c, g, f); mb.quad(c, d, h, g); mb.quad(d, a, e, h);
}
