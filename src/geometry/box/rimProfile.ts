import type { GrayImage } from '../../types';
import { KIT, WALL_IDS, type WallId } from './kitSpec';
import { heightForReach, rimPoint, wallSpan } from './shadowModel';
import type { TrayId } from './kitParts';

export interface BoxParams {
  /** Width in mm of the shadow image frame as it lands on the wall, centred on the light axis. */
  shadowSize: number;
  /** How much of the frame the image fills, percent. 200 makes the shadow twice as big, like Tealight's image size. */
  imageScale: number;
  /** LED height above the panel, mm. */
  lightHeight: number;
  tray: TrayId;
  /** 0..255; pixels darker than this are shadow (lighter when `invert`). */
  threshold: number;
  /** Blur applied to the image before the threshold, 0 to 40; the blur radius is this divided by 10 image pixels, as in Tealight. */
  edgeRounding: number;
  invert: boolean;
  /** Cut openings in the walls so lit areas inside the dark shape show. Off keeps solid-outline walls. */
  innerDetails: boolean;
  /** Narrowest wall spike that is kept as is, mm. */
  minSpike: number;
  /** Narrowest notch in the wall top that is kept, mm. */
  minGap: number;
  panelThreshold: number;
  panelInvert: boolean;
}

export const DEFAULT_BOX_PARAMS: BoxParams = {
  shadowSize: 450,
  imageScale: 100,
  lightHeight: 45,
  tray: '2AA',
  threshold: 128,
  edgeRounding: 10,
  invert: false,
  innerDetails: true,
  minSpike: 1.2,
  minGap: 0.8,
  panelThreshold: 128,
  panelInvert: false,
};

/** Samples along each wall, mm apart. */
export const PROFILE_STEP = 0.5;
/** A wall is never shorter than this from its seat, so it can still carry its tabs (the tallest reaches 14.2 mm). */
export const MIN_WALL_HEIGHT = 15;
/** The same limit as a height above the panel plane, which is where profile heights are measured. */
export const MIN_RIM_HEIGHT = MIN_WALL_HEIGHT - KIT.panelPlaneX;
/** Dark blobs smaller than this on the wall are treated as stray pixels, not shape. */
export const SPECK_AREA_MM2 = 25;

export interface RimProfile {
  /** Top-edge height above the panel plane at s = 0, step, 2 step ... span, for each wall. */
  heights: Record<WallId, Float32Array>;
  /** The same heights before spike widening and notch filling. */
  rawHeights: Record<WallId, Float32Array>;
  /** Whether the despeckled shadow image is dark at a point of the wall plane, in mm from the light axis (y up). */
  darkAt: (X: number, Y: number) => boolean;
  step: number;
  warnings: string[];
  /** Some of the shape needed a taller wall than the light height or the part allows. */
  clamped: boolean;
}

const maxHeightOf = (id: WallId, L: number) => Math.min(KIT.walls[id].maxHeight - KIT.panelPlaneX, L - 1);

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
  const size = p.shadowSize * (p.imageScale / 100); // width of the image on the wall, mm
  const k = size / Math.max(img.width, img.height); // mm per image pixel
  const t = p.threshold / 255;
  const { mask, specks, edgeDark } = darkMask(img, p.invert, t, SPECK_AREA_MM2 / (k * k), p.edgeRounding / 10);
  const darkAt = (X: number, Y: number) => {
    const ix = Math.floor(img.width / 2 + X / k), iy = Math.floor(img.height / 2 - Y / k);
    if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return false;
    return mask[iy * img.width + ix] === 1;
  };
  /** Distance to the outermost dark pixel along a direction from the light axis (0 if none). */
  const reachAt = (angle: number) => {
    const c = Math.cos(angle), s = Math.sin(angle), step = k * 0.5, rMax = size * 0.75;
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

  let clamped = false, anyDark = false, tooSmall = 0, shaped = 0, rMinLo = Infinity, rMinHi = 0;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const { id, s } = ring[i];
    const { d, angle } = rimPoint(id, s);
    const reach = reachAt(angle);
    const rMin = (d * (L + T)) / (L - MIN_RIM_HEIGHT); // the smallest shadow the box can cast in this direction
    rMinLo = Math.min(rMinLo, rMin); rMinHi = Math.max(rMinHi, rMin);
    if (reach > 0) { anyDark = true; shaped++; if (reach < rMin) tooSmall++; }
    const h = reach > 0 ? heightForReach(reach, d, L, T) : -Infinity;
    if (h > maxHeightOf(id, L) + 1e-9) clamped = true;
    raw[i] = Math.min(Math.max(h, MIN_RIM_HEIGHT), maxHeightOf(id, L));
  }

  // Keep every spike at least minSpike wide: lift only the peaks that an opening would remove.
  const MIN_CHANGE = 0.3; // mm: smaller differences are smoothing, not a feature
  const rS = Math.ceil(p.minSpike / (2 * PROFILE_STEP));
  const opened = dilate(erode(raw, rS), rS);
  const narrow = new Float64Array(n).fill(-Infinity);
  const widenedMask: boolean[] = [];
  for (let i = 0; i < n; i++) { const isNarrow = raw[i] > opened[i] + MIN_CHANGE; if (isNarrow) narrow[i] = raw[i]; widenedMask.push(isNarrow); }
  const widened = dilate(narrow, rS);
  const spiked = new Float64Array(n);
  for (let i = 0; i < n; i++) spiked[i] = Math.max(opened[i], widened[i], widenedMask[i] ? raw[i] : -Infinity);
  // Fill notches narrower than minGap.
  const rG = Math.ceil(p.minGap / (2 * PROFILE_STEP));
  const closed = erode(dilate(spiked, rG), rG);
  const filledMask = Array.from({ length: n }, (_, i) => closed[i] > spiked[i] + MIN_CHANGE);
  const final = new Float64Array(n);
  for (let i = 0; i < n; i++) final[i] = Math.min(Math.max(closed[i], MIN_RIM_HEIGHT), maxHeightOf(ring[i].id, L));

  const toWalls = (values: Float64Array) => {
    const out = {} as Record<WallId, Float32Array>;
    for (const id of WALL_IDS) {
      const m = Math.round(wallSpan(id) / PROFILE_STEP);
      const arr = new Float32Array(m + 1);
      const reversed = RING.find((q) => q.id === id)!.reversed;
      for (let j = reversed ? 1 : 0; j < (reversed ? m + 1 : m); j++) arr[j] = values[indexOf[id][j]];
      arr[reversed ? 0 : m] = values[cornerIndex[id]];
      out[id] = arr;
    }
    return out;
  };
  const heights = toWalls(final);
  const rawHeights = toWalls(raw);

  const warnings: string[] = [];
  if (!anyDark) warnings.push('The shadow image has no dark shape inside the frame, so every wall stays at its minimum height.');
  if (edgeDark >= 0.9) warnings.push('The shadow image is dark all the way to its edges, so the shadow runs off the frame. Check the threshold or turn on Invert.');
  if (shaped > 0 && tooSmall / shaped > 0.1)
    warnings.push(`Parts of the shape are smaller than the smallest shadow this box can cast (${Math.round(rMinLo)} to ${Math.round(rMinHi)} mm from the light, depending on direction), so the walls stay at their minimum height there. Increase the shadow size or lower the light.`);
  if (specks > 0) warnings.push(`${specks} stray speck${specks === 1 ? '' : 's'} (under ${SPECK_AREA_MM2} mm² on the wall) ${specks === 1 ? 'was' : 'were'} ignored.`);
  if (clamped) warnings.push(`The light height limits the shadow: parts that need walls taller than ${L - 1} mm are shortened. Raise the light height or reduce the shadow size.`);
  const w = countRuns(widenedMask), g = countRuns(filledMask);
  if (w > 0) warnings.push(`${w} spike${w === 1 ? '' : 's'} narrower than ${p.minSpike} mm ${w === 1 ? 'was' : 'were'} widened so they print.`);
  if (g > 0) warnings.push(`${g} notch${g === 1 ? '' : 'es'} narrower than ${p.minGap} mm ${g === 1 ? 'was' : 'were'} filled so they print.`);
  warnings.push(p.innerDetails
    ? 'Details smaller than the minimum feature size, or closer to the light than the box\'s own shadow, are not reproduced.'
    : 'Only shapes with one reach per direction from the light can be reproduced; anything else is simplified.');
  return { heights, rawHeights, darkAt, step: PROFILE_STEP, warnings, clamped };
}

/** Messages for settings the kit cannot be built with; empty when the parameters are usable. */
export function validateBoxParams(p: BoxParams): string[] {
  const e: string[] = [];
  const [lo, hi] = KIT.lightHeightRange;
  if (!(p.lightHeight >= lo && p.lightHeight <= hi)) e.push(`Light height must be between ${lo} and ${hi} mm (the post is ${KIT.post.length} mm long).`);
  if (!(p.shadowSize > 0)) e.push('Shadow size must be above 0 mm.');
  if (!(p.imageScale >= 10 && p.imageScale <= 400)) e.push('Image size must be between 10 % and 400 %.');
  if (!(p.edgeRounding >= 0 && p.edgeRounding <= 40)) e.push('Edge rounding must be between 0 and 40.');
  if (!(p.minSpike >= 0)) e.push('Minimum spike width cannot be negative.');
  if (!(p.minGap >= 0)) e.push('Minimum gap width cannot be negative.');
  return e;
}

/** Dark pixels as a mask with tiny dark blobs removed, how many were removed, and how much of the image edge is dark. */
function darkMask(img: GrayImage, invert: boolean, t: number, minPixels: number, sigma: number) {
  const { width: W, height: H } = img;
  const pixels = gaussianBlur(img.pixels, W, H, sigma);
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < mask.length; i++) mask[i] = (invert ? pixels[i] >= t : pixels[i] < t) ? 1 : 0;
  const seen = new Uint8Array(W * H), queue = new Int32Array(W * H);
  let specks = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start; seen[start] = 1;
    while (head < tail) {
      const c = queue[head++], x = c % W, y = (c - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; queue[tail++] = q; }
      }
    }
    if (tail < minPixels) { for (let i = 0; i < tail; i++) mask[queue[i]] = 0; specks++; }
  }
  let edge = 0, dark = 0;
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { edge++; dark += mask[y * W + x]; }
  for (let y = 1; y < H - 1; y++) for (const x of [0, W - 1]) { edge++; dark += mask[y * W + x]; }
  return { mask, specks, edgeDark: edge ? dark / edge : 0 };
}

/** Separable Gaussian blur with clamped edges; sigma in pixels (below 0.05 the image is returned as is). */
function gaussianBlur(src: Float32Array, W: number, H: number, sigma: number): Float32Array {
  if (sigma < 0.05) return src;
  const rad = Math.max(1, Math.ceil(3 * sigma));
  const ker = new Float32Array(2 * rad + 1);
  let sum = 0;
  for (let d = -rad; d <= rad; d++) { const v = Math.exp(-(d * d) / (2 * sigma * sigma)); ker[d + rad] = v; sum += v; }
  for (let d = 0; d < ker.length; d++) ker[d] /= sum;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0;
    for (let d = -rad; d <= rad; d++) a += ker[d + rad] * src[y * W + Math.min(W - 1, Math.max(0, x + d))];
    tmp[y * W + x] = a;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0;
    for (let d = -rad; d <= rad; d++) a += ker[d + rad] * tmp[Math.min(H - 1, Math.max(0, y + d)) * W + x];
    out[y * W + x] = a;
  }
  return out;
}
