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

  it('puts the light axis on the post bore at the box centre', () => {
    expect(KIT.lightAxis.x).toBeCloseTo(60, 1);
    expect(KIT.lightAxis.y).toBeCloseTo(75, 1);
    expect(KIT.lightHeightRange[0]).toBeLessThan(KIT.lightHeightRange[1]);
  });

  it('seats the walls on the tray skirt and puts the panel top 14 mm above that seat', () => {
    expect(KIT.wallSeatZ).toBeCloseTo(7.46, 2);
    expect(KIT.T).toBeCloseTo(21.5, 2);
    expect(KIT.panelPlaneX).toBeCloseTo(KIT.T - KIT.wallSeatZ, 2);
  });

  it('never mirrors a wall: every placement has a determinant of +1', () => {
    for (const id of WALL_IDS) {
      const { fixed, at, dir } = KIT.walls[id].plan;
      const inward = at === 0 ? 1 : -1;
      const zSign = KIT.walls[id].attachAtMax ? -1 : 1;
      const permutation = fixed === 'y' ? 1 : -1; // (x,y,z) -> (Z,X,Y) is even, (Z,Y,X) is odd
      expect(permutation * dir * inward * zSign, id).toBe(1);
    }
  });

  it('puts every wall tab on a notch of the tray rim (within 0.2 mm)', () => {
    // notch centres measured on the tray's inner wall, in the tray frame
    const NOTCHES: Record<WallId, number[]> = { w4: [26.05, 96.05], w1: [26.05, 96.05], w3: [27.05, 122.05], w2: [37.05, 117.05] };
    for (const id of WALL_IDS) {
      const { from, dir } = KIT.walls[id].plan;
      const centres = KIT.walls[id].features.map((f) => from + dir * ((f.y0 + f.y1) / 2)).sort((a, b) => a - b);
      centres.forEach((c, i) => expect(Math.abs(c - NOTCHES[id][i]), `${id} tab ${i}`).toBeLessThan(0.2));
    }
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

  it.skipIf(!haveOriginals)('finds the post bore in the tray at the light axis, not at the keyhole', () => {
    const file = readdirSync(DIR).find((f) => f.startsWith('obj_12_2AA'))!;
    const b = readFileSync(join(DIR, file));
    const p = parseBinaryStl(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer).positions;
    let minX = Infinity, minY = Infinity;
    for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); minY = Math.min(minY, p[i + 1]); }
    const onRing = (cx: number, cy: number) => {
      let n = 0;
      for (let i = 0; i < p.length; i += 3) if (Math.abs(Math.hypot(p[i] - minX - cx, p[i + 1] - minY - cy) - 5) < 0.1) n++;
      return n;
    };
    expect(onRing(KIT.lightAxis.x, KIT.lightAxis.y)).toBeGreaterThan(1000);
    expect(onRing(60, 117.9)).toBeLessThan(100);
  });

  it.skipIf(!haveOriginals)('matches the wall sizes of the original STLs', () => {
    for (const id of WALL_IDS) {
      const [h, len, t] = sizeOf(id);
      expect(h).toBeCloseTo(KIT.walls[id].maxHeight, 0);
      expect(len).toBeCloseTo(KIT.walls[id].length, 0);
      expect(t).toBeGreaterThanOrEqual(KIT.plateThickness);
    }
  });

  it.skipIf(!haveOriginals)("keeps the original walls' tops between the panel plane and the highest LED", () => {
    for (const id of WALL_IDS) {
      const spec = KIT.walls[id];
      const file = readdirSync(DIR).find((f) => f.startsWith(WALL_FILES[id]))!;
      const b = readFileSync(join(DIR, file));
      const p = parseBinaryStl(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer).positions;
      let minX = Infinity, minY = Infinity;
      for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); minY = Math.min(minY, p[i + 1]); }
      const tops = new Map<number, number>(); // top height from the seat, per 1 mm of length
      for (let i = 0; i < p.length; i += 3) {
        const y = Math.floor(p[i + 1] - minY), x = p[i] - minX;
        const height = spec.attachAtMax ? spec.maxHeight - x : x;
        tops.set(y, Math.max(tops.get(y) ?? 0, height));
      }
      const above = [...tops.values()].map((h) => h - KIT.panelPlaneX);
      expect(Math.min(...above), id).toBeGreaterThan(0);
      expect(above.filter((h) => h < KIT.lightHeightRange[1]).length / above.length, id).toBeGreaterThan(0.95);
    }
  });
});
