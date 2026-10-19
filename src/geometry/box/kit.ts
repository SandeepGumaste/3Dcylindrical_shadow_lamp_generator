import type { GrayImage } from '../../types';
import { indexedMeshToBinarySTL } from '../stl';
import { KIT, WALL_IDS, type WallId } from './kitSpec';
import { bundledPartsFor } from './kitParts';
import { buildRimProfile, type BoxParams } from './rimProfile';
import { generateWall } from './wallMesh';
import { generatePanel } from './panelMesh';
import { moveToOrigin, parseBinaryStl, type IndexedMesh } from './stlParse';
import { makeZip } from './zip';

export type PartLoader = (file: string) => Promise<ArrayBuffer>;

export interface KitPart {
  id: string;
  label: string;
  generated: boolean;
  mesh: IndexedMesh;
  stl: ArrayBuffer;
}

export interface KitResult {
  parts: KitPart[];
  /** Tray, panel and the four walls in place, in the tray frame (z up from the mounting wall). */
  preview: IndexedMesh;
  /** LED position in the same frame. */
  light: { x: number; y: number; z: number };
  warnings: string[];
  clamped: boolean;
  zip: Uint8Array;
}

const WALL_LABEL: Record<WallId, string> = { w1: 'Wall 1 (top)', w2: 'Wall 2 (right)', w3: 'Wall 3 (left)', w4: 'Wall 4 (bottom)' };
const HEADER = 'Odd Shadows box kit';
const wallPartId = (id: WallId) => `wall-${id.slice(1)}`;

/** Wall plate (x height, y length, z thickness) to the tray frame; the plate's +z face looks into the box. */
function placeWall(id: WallId, m: IndexedMesh): IndexedMesh {
  const spec = KIT.walls[id];
  const { fixed, at, from, dir } = spec.plan;
  const inward = at === 0 ? 1 : -1;
  const p = m.positions, out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const s = from + dir * y, depth = at + inward * z;
    out[i] = fixed === 'y' ? s : depth;
    out[i + 1] = fixed === 'y' ? depth : s;
    out[i + 2] = KIT.T + KIT.panelPlaneX + (spec.attachAtMax ? spec.maxHeight - x : x);
  }
  return { positions: out, indices: mirrorIfNeeded(out, m.indices) };
}

/** An affine map with a negative determinant turns triangles inside out; flip them back. */
function mirrorIfNeeded(positions: Float32Array, indices: Uint32Array): Uint32Array {
  let vol = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    vol += positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
      - positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c])
      + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  if (vol >= 0) return indices;
  const flipped = indices.slice();
  for (let t = 0; t < flipped.length; t += 3) [flipped[t + 1], flipped[t + 2]] = [flipped[t + 2], flipped[t + 1]];
  return flipped;
}

function translate(m: IndexedMesh, dx: number, dy: number, dz: number): IndexedMesh {
  const p = new Float32Array(m.positions.length);
  for (let i = 0; i < p.length; i += 3) { p[i] = m.positions[i] + dx; p[i + 1] = m.positions[i + 1] + dy; p[i + 2] = m.positions[i + 2] + dz; }
  return { positions: p, indices: m.indices };
}

function merge(meshes: IndexedMesh[]): IndexedMesh {
  const vn = meshes.reduce((n, m) => n + m.positions.length, 0), tn = meshes.reduce((n, m) => n + m.indices.length, 0);
  const positions = new Float32Array(vn), indices = new Uint32Array(tn);
  let po = 0, io = 0;
  for (const m of meshes) {
    positions.set(m.positions, po);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + po / 3;
    po += m.positions.length; io += m.indices.length;
  }
  return { positions, indices };
}

export async function buildKit(shadow: GrayImage, panelImg: GrayImage, p: BoxParams, load: PartLoader): Promise<KitResult> {
  const profile = buildRimProfile(shadow, p);
  const panel = generatePanel(panelImg, p);
  const warnings = [...profile.warnings, ...panel.warnings];
  const parts: KitPart[] = [];
  const push = (id: string, label: string, generated: boolean, mesh: IndexedMesh) =>
    parts.push({ id, label, generated, mesh, stl: indexedMeshToBinarySTL(mesh.positions, mesh.indices, HEADER) });

  const walls = {} as Record<WallId, IndexedMesh>;
  for (const id of WALL_IDS) { walls[id] = generateWall(id, profile); push(wallPartId(id), WALL_LABEL[id], true, moveToOrigin(walls[id])); }
  push('panel', 'Picture panel', true, moveToOrigin(panel.mesh));
  const fixed: Record<string, IndexedMesh> = {};
  for (const part of bundledPartsFor(p.tray)) {
    const mesh = moveToOrigin(parseBinaryStl(await load(part.file)));
    fixed[part.id] = mesh;
    push(part.id, part.label, false, mesh);
  }

  const tray = fixed[`tray-${p.tray.toLowerCase()}`];
  const inset = (KIT.boxW - 6 - KIT.panel.w) / 2 + 3;
  const preview = merge([
    tray,
    translate(panel.mesh, inset, (KIT.boxD - 6 - KIT.panel.h) / 2 + 3, KIT.T - KIT.panel.plate),
    ...WALL_IDS.map((id) => placeWall(id, walls[id])),
  ]);
  const zip = makeZip(parts.map((q) => ({ name: `${q.id}.stl`, data: new Uint8Array(q.stl) })));
  return { parts, preview, light: { x: KIT.lightAxis.x, y: KIT.lightAxis.y, z: KIT.T + p.lightHeight }, warnings, clamped: profile.clamped, zip };
}
