/**
 * Prints the measurements recorded in src/geometry/box/kitSpec.ts, from the owner's original STLs.
 * Run: npx tsx scripts/measure-kit.ts "research/<stl folder>"
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseBinaryStl } from '../src/geometry/box/stlParse';

const dir = process.argv[2];
if (!dir) throw new Error('usage: tsx scripts/measure-kit.ts <stl folder>');
const find = (frag: string) => readdirSync(dir).find((f) => f.startsWith(frag))!;
const load = (frag: string) => {
  const b = readFileSync(join(dir, find(frag)));
  return parseBinaryStl(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

interface Box { x0: number; x1: number; y0: number; y1: number; z1: number }
const r = (v: number) => Math.round(v * 10) / 10;

/** Flat, upward-facing triangles above `zMin`, merged into bounding boxes when they touch. */
function features(frag: string, zMin: number) {
  const m = load(frag), p = m.positions, ix = m.indices;
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
  const boxes: Box[] = [];
  for (let t = 0; t < ix.length; t += 3) {
    const v = [0, 1, 2].map((k) => ix[t + k] * 3);
    const z = v.map((o) => p[o + 2] - mn[2]);
    if (Math.abs(z[0] - z[1]) > 1e-3 || Math.abs(z[0] - z[2]) > 1e-3 || z[0] < zMin) continue;
    const ux = p[v[1]] - p[v[0]], uy = p[v[1] + 1] - p[v[0] + 1], vx = p[v[2]] - p[v[0]], vy = p[v[2] + 1] - p[v[0] + 1];
    if (ux * vy - uy * vx <= 0) continue;
    const xs = v.map((o) => p[o] - mn[0]), ys = v.map((o) => p[o + 1] - mn[1]);
    boxes.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z1: z[0] });
  }
  const groups: Box[] = [];
  for (const b of boxes) {
    const g = groups.find((q) => b.x0 <= q.x1 + 0.6 && b.x1 >= q.x0 - 0.6 && b.y0 <= q.y1 + 0.6 && b.y1 >= q.y0 - 0.6 && Math.abs(b.z1 - q.z1) < 0.05);
    if (g) { g.x0 = Math.min(g.x0, b.x0); g.x1 = Math.max(g.x1, b.x1); g.y0 = Math.min(g.y0, b.y0); g.y1 = Math.max(g.y1, b.y1); }
    else groups.push({ ...b });
  }
  return { size: mx.map((v, k) => r(v - mn[k])), groups: groups.map((g) => ({ x0: r(g.x0), x1: r(g.x1), y0: r(g.y0), y1: r(g.y1), z1: r(g.z1) })) };
}

for (const [id, frag] of [['w1', 'obj_5_1'], ['w4', 'obj_4_4'], ['w2', 'obj_3_2'], ['w3', 'obj_2_3']] as const) {
  const f = features(frag, 3.5);
  console.log(id, 'size', f.size.join(' x '));
  for (const g of f.groups) console.log('  raised', JSON.stringify(g));
  const m = load(frag).positions;
  const lo = [Infinity, Infinity, Infinity];
  for (let i = 0; i < m.length; i += 3) for (let k = 0; k < 3; k++) lo[k] = Math.min(lo[k], m[i + k]);
  const hi = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z1: -Infinity };
  for (let i = 0; i < m.length; i += 3) {
    if (m[i + 2] - lo[2] <= 5) continue;
    hi.x0 = Math.min(hi.x0, m[i] - lo[0]); hi.x1 = Math.max(hi.x1, m[i] - lo[0]);
    hi.y0 = Math.min(hi.y0, m[i + 1] - lo[1]); hi.y1 = Math.max(hi.y1, m[i + 1] - lo[1]); hi.z1 = Math.max(hi.z1, m[i + 2] - lo[2]);
  }
  if (hi.z1 > 0) console.log('  peg (vertices above z = 5)', JSON.stringify({ x0: r(hi.x0), x1: r(hi.x1), y0: r(hi.y0), y1: r(hi.y1), z1: r(hi.z1) }));
}
const tray = features('obj_12_2AA', 0);
console.log('tray size', tray.size.join(' x '));
