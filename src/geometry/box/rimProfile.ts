import type { GrayImage } from '../../types';
import { KIT, WALL_IDS, type WallId } from './kitSpec';
import { heightForReach, rimPoint, wallSpan } from './shadowModel';
import type { TrayId } from './kitParts';

export interface BoxParams {
  /** Width in mm of the shadow image frame as it lands on the wall, centred on the light axis. */
  shadowSize: number;
  /** LED height above the panel, mm. */
  lightHeight: number;
  tray: TrayId;
  /** 0..255; pixels darker than this are shadow (lighter when `invert`). */
  threshold: number;
  invert: boolean;
  /** Narrowest wall spike that is kept as is, mm. */
  minSpike: number;
  /** Narrowest notch in the wall top that is kept, mm. */
  minGap: number;
  panelThreshold: number;
  panelInvert: boolean;
}

export const DEFAULT_BOX_PARAMS: BoxParams = {
  shadowSize: 450,
  lightHeight: 40,
  tray: '2AA',
  threshold: 128,
  invert: false,
  minSpike: 1.2,
  minGap: 0.8,
  panelThreshold: 128,
  panelInvert: false,
};

/** Samples along each wall, mm apart. */
export const PROFILE_STEP = 0.5;
/** A wall never drops below this, so it can still carry its tabs (the tallest is 14.2 mm). */
export const MIN_WALL_HEIGHT = 15;

export interface RimProfile {
  /** Top-edge height above the panel plane at s = 0, step, 2 step ... span, for each wall. */
  heights: Record<WallId, Float32Array>;
  step: number;
  warnings: string[];
  /** Some of the shape needed a taller wall than the light height or the part allows. */
  clamped: boolean;
}

const maxHeightOf = (id: WallId, L: number) => Math.min(KIT.walls[id].maxHeight, L - 1);

/** Order of the walls around the box and whether each is walked from its far end. */
const RING: { id: WallId; reversed: boolean }[] = [
  { id: 'w4', reversed: false }, { id: 'w2', reversed: false }, { id: 'w1', reversed: true }, { id: 'w3', reversed: true },
];

const erode = (a: Float64Array, r: number) => slide(a, r, Math.min, Infinity);
const dilate = (a: Float64Array, r: number) => slide(a, r, Math.max, -Infinity);
function slide(a: Float64Array, r: number, pick: (x: number, y: number) => number, init: number): Float64Array {
  const n = a.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = init;
    for (let j = -r; j <= r; j++) v = pick(v, a[(((i + j) % n) + n) % n]);
    out[i] = v;
  }
  return out;
}
const countRuns = (changed: boolean[]) => {
  let runs = 0;
  for (let i = 0; i < changed.length; i++) if (changed[i] && !changed[(i + changed.length - 1) % changed.length]) runs++;
  return runs;
};

export function buildRimProfile(img: GrayImage, p: BoxParams): RimProfile {
  const L = p.lightHeight, T = KIT.T;
  const k = p.shadowSize / Math.max(img.width, img.height); // mm per image pixel
  const t = p.threshold / 255;
  const darkAt = (X: number, Y: number) => {
    const ix = Math.floor(img.width / 2 + X / k), iy = Math.floor(img.height / 2 - Y / k);
    if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return false;
    const lum = img.pixels[iy * img.width + ix];
    return p.invert ? lum >= t : lum < t;
  };
  /** Distance to the outermost dark pixel along a direction from the light axis (0 if none). */
  const reachAt = (angle: number) => {
    const c = Math.cos(angle), s = Math.sin(angle), step = k * 0.5, rMax = p.shadowSize * 0.75;
    let last = 0;
    for (let r = 0; r <= rMax; r += step) if (darkAt(r * c, r * s)) last = r;
    return last;
  };

  // One closed loop of samples around the box, so processing treats the corners like any other point.
  const ring: { id: WallId; s: number }[] = [];
  const indexOf: Record<WallId, number[]> = { w1: [], w2: [], w3: [], w4: [] };
  for (const { id, reversed } of RING) {
    const n = Math.round(wallSpan(id) / PROFILE_STEP);
    for (let i = 0; i < n; i++) {
      const s = reversed ? wallSpan(id) - i * PROFILE_STEP : i * PROFILE_STEP;
      indexOf[id][reversed ? n - i : i] = ring.length;
      ring.push({ id, s });
    }
  }
  const n = ring.length;
  // The corner sample of each wall is the first sample of the next wall around the loop.
  const cornerIndex: Record<WallId, number> = {
    w4: indexOf.w2[0],
    w2: indexOf.w1[Math.round(wallSpan('w1') / PROFILE_STEP)],
    w1: indexOf.w3[Math.round(wallSpan('w3') / PROFILE_STEP)],
    w3: indexOf.w4[0],
  };

  let clamped = false, anyDark = false;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const { id, s } = ring[i];
    const { d, angle } = rimPoint(id, s);
    const reach = reachAt(angle);
    if (reach > 0) anyDark = true;
    const h = reach > 0 ? heightForReach(reach, d, L, T) : -Infinity;
    if (h > maxHeightOf(id, L) + 1e-9) clamped = true;
    raw[i] = Math.min(Math.max(h, MIN_WALL_HEIGHT), maxHeightOf(id, L));
  }

  // Keep every spike at least minSpike wide: lift only the peaks that an opening would remove.
  const rS = Math.floor(Math.ceil(p.minSpike / PROFILE_STEP) / 2);
  const opened = dilate(erode(raw, rS), rS);
  const narrow = new Float64Array(n).fill(-Infinity);
  const widenedMask: boolean[] = [];
  for (let i = 0; i < n; i++) { const isNarrow = raw[i] > opened[i] + 0.01; if (isNarrow) narrow[i] = raw[i]; widenedMask.push(isNarrow); }
  const widened = dilate(narrow, rS);
  const spiked = new Float64Array(n);
  for (let i = 0; i < n; i++) spiked[i] = Math.max(opened[i], widened[i], widenedMask[i] ? raw[i] : -Infinity);
  // Fill notches narrower than minGap.
  const rG = Math.floor(Math.ceil(p.minGap / PROFILE_STEP) / 2);
  const closed = erode(dilate(spiked, rG), rG);
  const filledMask = Array.from({ length: n }, (_, i) => closed[i] > spiked[i] + 0.01);
  const final = new Float64Array(n);
  for (let i = 0; i < n; i++) final[i] = Math.min(Math.max(closed[i], MIN_WALL_HEIGHT), maxHeightOf(ring[i].id, L));

  const heights = {} as Record<WallId, Float32Array>;
  for (const id of WALL_IDS) {
    const m = Math.round(wallSpan(id) / PROFILE_STEP);
    const out = new Float32Array(m + 1);
    const reversed = RING.find((q) => q.id === id)!.reversed;
    for (let j = reversed ? 1 : 0; j < (reversed ? m + 1 : m); j++) out[j] = final[indexOf[id][j]];
    out[reversed ? 0 : m] = final[cornerIndex[id]];
    heights[id] = out;
  }

  const warnings: string[] = [];
  if (!anyDark) warnings.push('The shadow image has no dark shape inside the frame, so every wall stays at its minimum height.');
  if (clamped) warnings.push(`The light height limits the shadow: parts that need walls taller than ${L - 1} mm are shortened. Raise the light height or reduce the shadow size.`);
  const w = countRuns(widenedMask), g = countRuns(filledMask);
  if (w > 0) warnings.push(`${w} spike${w === 1 ? '' : 's'} narrower than ${p.minSpike} mm ${w === 1 ? 'was' : 'were'} widened so they print.`);
  if (g > 0) warnings.push(`${g} notch${g === 1 ? '' : 'es'} narrower than ${p.minGap} mm ${g === 1 ? 'was' : 'were'} filled so they print.`);
  warnings.push('Only shapes with one reach per direction from the light can be reproduced; anything else is simplified.');
  return { heights, step: PROFILE_STEP, warnings, clamped };
}
