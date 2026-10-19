import { describe, it, expect } from 'vitest';
import { generatePerforatedWall } from '../perforatedWall';
import { generateWall } from '../wallMesh';
import { PLATE_CELL, type PlateField } from '../plateField';
import { PROFILE_STEP, type RimProfile } from '../rimProfile';
import { KIT, WALL_IDS, type WallId } from '../kitSpec';
import { wallSpan } from '../shadowModel';
import { checkMesh } from '../../meshCheck';

/** A plate that is solid up to `top` mm from the seat, with one open rectangle (in cells) if given. */
const plate = (id: WallId, top: number, hole?: { c0: number; c1: number; r0: number; r1: number }): PlateField => {
  const cols = Math.round(KIT.walls[id].length / PLATE_CELL), rows = Math.ceil(KIT.walls[id].maxHeight / PLATE_CELL);
  const solid = new Uint8Array(cols * rows);
  const rowPitch = KIT.walls[id].maxHeight / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let on = (r + 0.5) * rowPitch <= top;
    if (hole && c >= hole.c0 && c < hole.c1 && r >= hole.r0 && r < hole.r1) on = false;
    solid[r * cols + c] = on ? 1 : 0;
  }
  return { cols, rows, solid, report: { openings: hole ? 1 : 0, thickened: 0, bridged: 0, dropped: 0 } };
};
const flat = (h: number): RimProfile => {
  const heights = Object.fromEntries(WALL_IDS.map((id) => [id, new Float32Array(Math.round(wallSpan(id) / PROFILE_STEP) + 1).fill(h)])) as RimProfile['heights'];
  return { heights, rawHeights: heights, darkAt: () => true, step: PROFILE_STEP, warnings: [], clamped: false };
};
const bbox = (p: Float32Array) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
  return { mn, mx };
};

describe.each(WALL_IDS)('perforated wall %s', (id: WallId) => {
  const spec = KIT.walls[id];
  const hole = { c0: 150, c1: 200, r0: 70, r1: 90 };
  const mesh = generatePerforatedWall(id, plate(id, 44, hole));

  it('is a closed, outward-facing mesh', () => {
    const c = checkMesh(mesh.positions, mesh.indices);
    expect(c.errors).toEqual([]);
    expect(c.watertight).toBe(true);
    expect(c.signedVolume).toBeGreaterThan(0);
  });

  it('has the original plate length and thickness', () => {
    const { mn, mx } = bbox(mesh.positions);
    expect(mx[1] - mn[1]).toBeCloseTo(spec.length, 0);
    expect(mx[2] - mn[2]).toBeCloseTo(Math.max(...spec.features.map((f) => f.z1)), 1);
  });

  it('has a through opening where the field is open', () => {
    const yc = ((hole.c0 + hole.c1) / 2) * (spec.length / Math.round(spec.length / PLATE_CELL));
    const hs = ((hole.r0 + hole.r1) / 2) * (spec.maxHeight / Math.ceil(spec.maxHeight / PLATE_CELL));
    const xc = spec.attachAtMax ? spec.maxHeight - hs : hs;
    const p = mesh.positions, ix = mesh.indices;
    let coveringFaces = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1];
      const wx = xc - p[a], wy = yc - p[a + 1];
      const d = ux * vy - uy * vx;
      if (Math.abs(d) < 1e-9) continue;
      const s = (wx * vy - wy * vx) / d, u = (ux * wy - uy * wx) / d;
      const inside = s >= 0 && u >= 0 && s + u <= 1;
      const flatFace = Math.abs(p[a + 2] - p[b + 2]) < 1e-6 && Math.abs(p[a + 2] - p[c + 2]) < 1e-6;
      if (inside && flatFace) coveringFaces++;
    }
    expect(coveringFaces).toBe(0);
  });

  it('carries every tab where the original has it', () => {
    const p = mesh.positions;
    for (const f of spec.features) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < p.length; i += 3) {
        if (Math.abs(p[i + 2] - f.z1) > 1e-4) continue;
        if (p[i] < f.x0 - 0.5 || p[i] > f.x1 + 0.5 || p[i + 1] < f.y0 - 0.5 || p[i + 1] > f.y1 + 0.5) continue;
        x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
      }
      expect([x0, x1, y0, y1].map((v) => Math.round(v * 10) / 10)).toEqual([f.x0, f.x1, f.y0, f.y1]);
    }
  });

  it('without openings has about the volume of the plain wall', () => {
    const top = 30 + KIT.panelPlaneX;
    const full = generatePerforatedWall(id, plate(id, top));
    const plain = generateWall(id, flat(30));
    const vf = checkMesh(full.positions, full.indices).signedVolume, vp = checkMesh(plain.positions, plain.indices).signedVolume;
    expect(Math.abs(vf - vp) / vp).toBeLessThan(0.03);
  });

  it('triangulates a plate without openings quickly', () => {
    const t0 = Date.now();
    generatePerforatedWall(id, plate(id, 44));
    expect(Date.now() - t0).toBeLessThan(300);
  });
});
