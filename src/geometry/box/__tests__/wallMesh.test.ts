import { describe, it, expect } from 'vitest';
import { generateWall } from '../wallMesh';
import { PROFILE_STEP, type RimProfile } from '../rimProfile';
import { KIT, WALL_IDS, type WallId } from '../kitSpec';
import { wallSpan } from '../shadowModel';
import { checkMesh } from '../../meshCheck';

const flat = (h: number): RimProfile => ({
  heights: Object.fromEntries(WALL_IDS.map((id) => [id, new Float32Array(Math.round(wallSpan(id) / PROFILE_STEP) + 1).fill(h)])) as RimProfile['heights'],
  step: PROFILE_STEP, warnings: [], clamped: false,
});
const bbox = (p: Float32Array) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
  return { mn, mx };
};

describe.each(WALL_IDS)('wall %s', (id: WallId) => {
  const spec = KIT.walls[id];
  const mesh = generateWall(id, flat(30));

  it('is a closed, outward-facing mesh', () => {
    const c = checkMesh(mesh.positions, mesh.indices);
    expect(c.errors).toEqual([]);
    expect(c.watertight).toBe(true);
    expect(c.signedVolume).toBeGreaterThan(0);
  });

  it('has the original plate length and a thickness of plate plus the tallest tab', () => {
    const { mn, mx } = bbox(mesh.positions);
    expect(mx[1] - mn[1]).toBeCloseTo(spec.length, 1);
    expect(mx[2] - mn[2]).toBeCloseTo(Math.max(...spec.features.map((f) => f.z1)), 1);
  });

  it('puts a flat top at the requested height above the panel plane', () => {
    const { mn, mx } = bbox(mesh.positions);
    const extent = mx[0] - mn[0];
    expect(extent).toBeCloseTo(spec.attachAtMax ? spec.maxHeight - (spec.maxHeight - 30) : 30, 1);
    expect(spec.attachAtMax ? mx[0] : mn[0]).toBeCloseTo(spec.attachAtMax ? spec.maxHeight : 0, 1);
  });

  it('carries every tab where the original has it (mating dimensions within 0.1 mm)', () => {
    const { positions: p } = mesh;
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
});
