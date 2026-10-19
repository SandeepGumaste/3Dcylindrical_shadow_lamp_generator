import type { GrayImage } from '../../types';
import { indexedMeshToBinarySTL } from '../stl';
import { KIT, WALL_IDS, type WallId } from './kitSpec';
import { bundledPartsFor } from './kitParts';
import { buildRimProfile, type BoxParams } from './rimProfile';
import { generateWall } from './wallMesh';
import { buildPlateField } from './plateField';
import { generatePerforatedWall } from './perforatedWall';
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

/**
 * Wall plate (x height, y length, z thickness) to the tray frame; the plate's +z face looks into the box.
 * Every wall's map has a determinant of +1 (checked in the kit spec), so the part is placed as printed, never mirrored.
 */
export function placeWall(id: WallId, m: IndexedMesh): IndexedMesh {
  const spec = KIT.walls[id];
  const { fixed, at, from, dir } = spec.plan;
  const inward = at === 0 ? 1 : -1;
  const p = m.positions, out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const s = from + dir * y, depth = at + inward * z;
    out[i] = fixed === 'y' ? s : depth;
    out[i + 1] = fixed === 'y' ? depth : s;
    out[i + 2] = KIT.wallSeatZ + (spec.attachAtMax ? spec.maxHeight - x : x);
  }
  return { positions: out, indices: m.indices };
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
  const totals = { openings: 0, thickened: 0, bridged: 0, dropped: 0 };
  for (const id of WALL_IDS) {
    if (p.innerDetails) {
      const field = buildPlateField(id, profile, p);
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += field.report[k];
      walls[id] = generatePerforatedWall(id, field);
    } else walls[id] = generateWall(id, profile);
    push(wallPartId(id), WALL_LABEL[id], true, moveToOrigin(walls[id]));
  }
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (totals.openings > 0) warnings.push(`${plural(totals.openings, 'opening was', 'openings were')} cut in the walls for lit areas inside the shape.`);
  if (totals.thickened > 0) warnings.push(`${plural(totals.thickened, 'thin stroke was', 'thin strokes were')} thickened so they print.`);
  if (totals.bridged > 0) warnings.push(`${plural(totals.bridged, 'floating piece was', 'floating pieces were')} joined to the wall with a small bridge.`);
  if (totals.dropped > 0) warnings.push(`${plural(totals.dropped, 'floating piece', 'floating pieces')} with nothing to join to ${totals.dropped === 1 ? 'was' : 'were'} left out.`);
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
