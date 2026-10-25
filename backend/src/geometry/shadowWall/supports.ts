/**
 * Snap-off supports for the shadow wall: thin pillars under every overhanging cut-out roof. Each pillar stands on the
 * solid below it and touches the roof through a narrow neck, so it breaks off by hand without damaging the wall.
 * Pillars are separate closed shells in the same mesh, laid out in the wall's (column, height) parameter space and
 * extruded between the inner and outer surface maps, so they follow the wall's ray taper.
 */
import { MeshBuilder, SurfaceMap } from '../shellMesh';

export const SUPPORT_WIDTH = 1.6;   // mm along the wall, the pillar body
export const NECK_WIDTH = 0.6;      // mm along the wall, where it touches the roof
export const NECK_HEIGHT = 1;       // mm over which the body narrows to the neck
export const SUPPORT_EMBED = 0.15;  // mm the ends sink into the solid above and below, so they fuse with it
export const SUPPORT_SPACING = 8;   // mm: at most this much roof per pillar
export const SUPPORT_MAX_SLOPE = 1; // roofs rising less than this (dz / arc, 1 = 45 degrees) are overhangs that need a pillar
const MIN_RUN = 1.5;                // mm: shorter flat roofs print as small bridges
const MIN_HEIGHT = 1.5;             // mm: shorter gaps need no pillar

export interface SupportSpec {
  cols: number;
  zs: ArrayLike<number>;
  field: ArrayLike<number>;
  bandStart: number;
  bandEnd: number;
  /** Arc length of one column on the inner surface, mm. */
  cell: number;
  inner: SurfaceMap;
  outer: SurfaceMap;
}

export interface SupportReport { count: number; skipped: number }

interface Roof { i: number; j: number; zr: number; jb: number; zb: number; next: Roof | null; hasPrev: boolean }

export function addSupports(mb: MeshBuilder, s: SupportSpec): SupportReport {
  const { cols: C, zs, field: f, cell } = s;
  const fAt = (i: number, j: number) => f[((i % C) + C) % C + C * j];

  const roofs: Roof[][] = Array.from({ length: C }, () => []);
  for (let i = 0; i < C; i++)
    for (let j = s.bandStart + 1; j <= s.bandEnd; j++) {
      const f1 = fAt(i, j), f0 = fAt(i, j - 1);
      if (!(f1 > 0) || f0 > 0) continue;
      let jb = j - 1;
      while (jb >= 0 && fAt(i, jb) <= 0) jb--;
      if (jb < 0) continue;
      const zr = zs[j - 1] + (zs[j] - zs[j - 1]) * (-f0 / (f1 - f0));
      const fs = fAt(i, jb), fv = fAt(i, jb + 1);
      const zb = zs[jb] + (zs[jb + 1] - zs[jb]) * (fs / (fs - fv));
      roofs[i].push({ i, j, zr, jb, zb, next: null, hasPrev: false });
    }

  // Link neighbouring columns' roofs of the same cut-out where the roof rises less than SUPPORT_MAX_SLOPE.
  for (let i = 0; i < C; i++)
    for (const r of roofs[i]) {
      let best: Roof | null = null;
      for (const r2 of roofs[(i + 1) % C]) {
        if (Math.abs(r2.j - r.j) > 2 || r2.hasPrev) continue;
        if (!best || Math.abs(r2.zr - r.zr) < Math.abs(best.zr - r.zr)) best = r2;
      }
      if (best && Math.abs(best.zr - r.zr) / cell < SUPPORT_MAX_SLOPE) { r.next = best; best.hasPrev = true; }
    }

  const report: SupportReport = { count: 0, skipped: 0 };
  const hb = SUPPORT_WIDTH / 2 / cell, hn = NECK_WIDTH / 2 / cell; // half widths in columns
  for (const col of roofs) for (const first of col) {
    if (first.hasPrev || !first.next) continue;
    const run: Roof[] = [];
    for (let r: Roof | null = first; r && run.length <= C; r = r.next) run.push(r);
    const L = run.length;
    if (L * cell < MIN_RUN) continue;
    const n = Math.max(1, Math.ceil((L * cell) / SUPPORT_SPACING));
    const used: number[] = [];
    // Lowest height from which the gap under the roof stays clear for the pillar's width at column u; null when too short.
    const place = (u: number, whole: boolean): { ref: Roof; zBase: number } | null => {
      if (u < first.i || u > first.i + L - 1 || used.some((v) => Math.abs(v - u) < 2 * hb + 1)) return null;
      const ref = run[Math.min(L - 1, Math.max(0, Math.floor(u - first.i + 0.5)))];
      let js = ref.j;
      for (let j = ref.j - 1; j > ref.jb; j--) {
        let clear = true;
        for (let c = Math.floor(u - hb) - 1; c <= Math.ceil(u + hb) + 1 && clear; c++) if (fAt(c, j) > 0) clear = false;
        if (!clear) break;
        js = j;
      }
      const whole_ = js === ref.jb + 1;
      if (whole && !whole_) return null;
      const zBase = whole_ ? ref.zb : zs[js];
      return ref.zr - zBase >= MIN_HEIGHT ? { ref, zBase } : null;
    };
    for (let k = 0; k < n; k++) {
      const ideal = first.i - 0.5 + ((k + 0.5) * L) / n;
      // Nearest spot to the ideal one along the whole roof: first one that stands on the solid below, else one wedged
      // where the gap under the roof narrows (a V-shaped cut-out), standing on its narrow bottom from the first clear row up.
      let placed: { u: number; ref: Roof; zBase: number } | null = null;
      for (const whole of [true, false])
        for (let d = 0; d <= L && !placed; d++)
          for (const u of d === 0 ? [ideal] : [ideal - d, ideal + d]) {
            const r = place(u, whole);
            if (r) { placed = { u, ...r }; break; }
          }
      if (!placed) { report.skipped++; continue; }
      used.push(placed.u);
      addPillar(mb, s, placed.u, hb, hn, placed.zBase, placed.ref.zr);
      report.count++;
    }
  }
  return report;
}

/** One pillar: four height levels (embedded foot, top of the body, roof contact, embedded tip) with half widths hb, hb, hn, hn. */
function addPillar(mb: MeshBuilder, s: SupportSpec, u: number, hb: number, hn: number, zb: number, zr: number): void {
  const zLevels = [zb - SUPPORT_EMBED, zr - NECK_HEIGHT, zr, zr + SUPPORT_EMBED];
  const half = [hb, hb, hn, hn];
  const theta = (col: number) => (2 * Math.PI * col) / s.cols;
  const IL: number[] = [], IR: number[] = [], OL: number[] = [], OR: number[] = [];
  for (let k = 0; k < 4; k++) {
    const z = zLevels[k];
    for (const [side, col] of [[IL, u - half[k]], [IR, u + half[k]]] as [number[], number][]) {
      const p = s.inner(theta(col), z);
      side.push(mb.vertex(p[0], p[1], p[2]));
    }
    for (const [side, col] of [[OL, u - half[k]], [OR, u + half[k]]] as [number[], number][]) {
      const p = s.outer(theta(col), z);
      side.push(mb.vertex(p[0], p[1], p[2]));
    }
  }
  const quads: [number, number, number, number][] = [];
  for (let k = 0; k < 3; k++) {
    quads.push([IL[k], IR[k], IR[k + 1], IL[k + 1]]);   // inner face
    quads.push([OL[k], OL[k + 1], OR[k + 1], OR[k]]);   // outer face
    quads.push([IL[k], IL[k + 1], OL[k + 1], OL[k]]);   // left side
    quads.push([IR[k], OR[k], OR[k + 1], IR[k + 1]]);   // right side
  }
  quads.push([IL[0], OL[0], OR[0], IR[0]]);             // foot
  quads.push([IL[3], IR[3], OR[3], OL[3]]);             // tip

  // Wind every triangle outwards: flip the lot when the signed volume comes out negative.
  const P = mb.positions;
  let vol = 0;
  for (const [a, b, c, d] of quads)
    for (const [x, y, z] of [[a, b, c], [a, c, d]]) {
      const ax = P[3 * x], ay = P[3 * x + 1], az = P[3 * x + 2];
      const bx = P[3 * y], by = P[3 * y + 1], bz = P[3 * y + 2];
      const cx = P[3 * z], cy = P[3 * z + 1], cz = P[3 * z + 2];
      vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    }
  for (const [a, b, c, d] of quads) {
    if (vol >= 0) mb.quad(a, b, c, d); else mb.quad(d, c, b, a);
  }
}
