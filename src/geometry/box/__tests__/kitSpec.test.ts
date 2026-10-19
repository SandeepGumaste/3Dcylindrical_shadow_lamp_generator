import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseBinaryStl } from '../stlParse';
import { KIT, WALL_IDS, type WallId } from '../kitSpec';

const DIR = join(process.cwd(), 'research', readdirSync(join(process.cwd(), 'research')).find((f) => f.endsWith('_stls')) ?? 'missing');
const haveOriginals = existsSync(DIR);
const WALL_FILES: Record<WallId, string> = { w1: 'obj_5_1', w2: 'obj_3_2', w3: 'obj_2_3', w4: 'obj_4_4' };
const sizeOf = (id: WallId) => {
  const file = readdirSync(DIR).find((f) => f.startsWith(WALL_FILES[id]))!;
  const b = readFileSync(join(DIR, file));
  const p = parseBinaryStl(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer).positions;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
  return mx.map((v, k) => v - mn[k]);
};

describe('kit specification', () => {
  it('describes a 120 x 150 mm box with 3 mm walls', () => {
    expect(KIT.boxW).toBe(120);
    expect(KIT.boxD).toBe(150);
    expect(KIT.plateThickness).toBe(3);
  });

  it('puts the light axis on the post socket, away from the box centre', () => {
    expect(KIT.lightAxis.x).toBeCloseTo(60, 1);
    expect(KIT.lightAxis.y).toBeCloseTo(117.9, 1);
    expect(KIT.lightHeightRange[0]).toBeLessThan(KIT.lightHeightRange[1]);
  });

  it('keeps every feature inside its wall and above the plate', () => {
    for (const id of WALL_IDS) {
      const w = KIT.walls[id];
      expect(w.features.length).toBeGreaterThan(0);
      for (const f of w.features) {
        expect(f.x0).toBeGreaterThanOrEqual(0); expect(f.x1).toBeLessThanOrEqual(w.maxHeight + 0.01);
        expect(f.y0).toBeGreaterThanOrEqual(0); expect(f.y1).toBeLessThanOrEqual(w.length + 0.01);
        expect(f.z0).toBe(KIT.plateThickness); expect(f.z1).toBeGreaterThan(f.z0);
      }
    }
  });

  it.skipIf(!haveOriginals)('matches the wall sizes of the original STLs', () => {
    for (const id of WALL_IDS) {
      const [h, len, t] = sizeOf(id);
      expect(h).toBeCloseTo(KIT.walls[id].maxHeight, 0);
      expect(len).toBeCloseTo(KIT.walls[id].length, 0);
      expect(t).toBeGreaterThanOrEqual(KIT.plateThickness);
    }
  });
});
