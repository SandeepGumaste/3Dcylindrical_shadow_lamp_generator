/**
 * Shadow wall: a standing thin wall around a point light whose footprint is a rounded rectangle or an
 * ellipse. Parameters, validation, node rows and the solid / open field. Pure functions only (no DOM /
 * three.js) so this can run in a worker.
 *
 * Image convention: dark pixels are shadow, so the wall is solid there (the Box shadow convention).
 * Tilted sampling: for table position (X, Y) (mm, x right, y up) the image point is found by
 * subtracting the offsets, rotating by -rotation degrees (the image turns counter-clockwise on the
 * table by `rotation`), then pixel = (width / 2 + x / k - 0.5, height / 2 - y / k - 0.5) with
 * k = mm per pixel. Outside the canvas counts as light (open).
 */
import type { GrayImage } from '../../types';
import { sampleBilinear } from '../../image/sampling';
import { gaussianBlur, labelComponents } from '../tealightShade';
import { buildOutline, FootprintParams, Outline } from './footprint';
import { MeshBuilder, SurfaceMap, buildShell } from '../shellMesh';
import { checkMesh, MeshCheck } from '../meshCheck';
import { BaseSpec, addBase, validateBase } from './base';

export interface ShadowWallParams extends FootprintParams {
  height: number;        // mm, total wall height
  lightHeight: number;   // mm, hf
  shadowSize: number;    // mm width of the image canvas on the table at 100 %
  imageScale: number;    // %
  rotation: number;      // degrees, counter-clockwise on the table
  offsetX: number; offsetY: number; // mm, shift the image on the table
  threshold: number;     // 0..255
  edgeRounding: number;  // 0..40, blur radius = value / 10 grid pixels
  invert: boolean;       // false: dark pixels are shadow (solid)
  minFeature: number;    // mm, 0 = off
  base: boolean;         // plate under the wall (z = 0 of the wall is the top of the plate)
  baseThickness: number; // mm
  baseHoleDiameter: number; // mm, centre hole for the light
  magnetHoles: boolean;
  magnetDiameter: number; // mm
  magnetDepth: number;    // mm, from the underside
  magnetOffset: number;   // mm, pockets at (0, +offset) and (0, -offset)
}

export const DEFAULT_SHADOW_WALL_PARAMS: ShadowWallParams = {
  kind: 'rectangle',
  width: 80,
  length: 80,
  cornerRadius: 10,
  wallThickness: 1.2,
  height: 70,
  lightHeight: 90,
  shadowSize: 400,
  imageScale: 100,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  threshold: 128,
  edgeRounding: 10,
  invert: false,
  minFeature: 0.8,
  base: true,
  baseThickness: 3,
  baseHoleDiameter: 12.5,
  magnetHoles: true,
  magnetDiameter: 8.1,
  magnetDepth: 2.1,
  magnetOffset: 12,
};

export const FOOT = 3; // mm of solid foot band
const MAX_ROWS = 1500;

export interface ShadowWallGeometry {
  outline: Outline;
  zs: Float64Array;       // node row heights, strictly increasing from 0 to height
  footRows: number;       // rows 0 .. footRows - 1 are the foot
  bandStart: number;      // first node row of the pattern band (z = FOOT)
  bandEnd: number;        // last node row = the top edge of the wall (z = height); the pattern runs all the way up
  blendBottom: number;    // top of the solid foot = top of the foot blend zone (max(FOOT, 1.25 (sMax - 1) hf))
  blendTop: number;       // top of the pattern band = the height (no top blend)
}

/** Blend weight of the ray taper: 0 at the table, 1 from the top of the foot all the way to the top edge. */
export function blendWeight(g: Pick<ShadowWallGeometry, 'blendBottom' | 'blendTop'>, _p: Pick<ShadowWallParams, 'height'>, z: number): number {
  return z < g.blendBottom ? z / g.blendBottom : 1;
}

/** Outer-surface height for an inner-surface height z at a column whose ray scale is s (the ray from the light through the inner point leaves the outer outline at s * q). */
export function outerHeightAt(g: Pick<ShadowWallGeometry, 'blendBottom' | 'blendTop'>, p: Pick<ShadowWallParams, 'height' | 'lightHeight'>, s: number, z: number): number {
  return z + blendWeight(g, p, z) * (p.lightHeight - z) * (1 - s);
}

/** How far the ground (where the shadow lands) lies below the wall's z = 0: the base thickness, 0 without a base. */
export const groundDrop = (p: Pick<ShadowWallParams, 'base' | 'baseThickness'>): number => (p.base ? p.baseThickness : 0);

/** Table position of wall node (q, z) is q * tableScale: the ray from the light at hf through the node reaches the ground `ground` below z = 0. */
export function tableScale(hf: number, ground: number, z: number): number {
  return (hf + ground) / (hf - z);
}

/** Light and top heights for the preview, measured from the ground (the underside of the base). */
export function previewHeights(p: Pick<ShadowWallParams, 'base' | 'baseThickness' | 'lightHeight' | 'height'>): { lightZ: number; topZ: number } {
  const G = groundDrop(p);
  return { lightZ: p.lightHeight + G, topZ: p.height + G };
}

export function baseSpecOf(p: ShadowWallParams): BaseSpec {
  return { thickness: p.baseThickness, holeDiameter: p.baseHoleDiameter, magnets: p.magnetHoles, magnetDiameter: p.magnetDiameter, magnetDepth: p.magnetDepth, magnetOffset: p.magnetOffset };
}

export function validateShadowWallParams(p: ShadowWallParams): string[] {
  const e: string[] = [];
  const t = p.wallThickness;
  if (!(t > 0)) e.push('Wall Thickness must be positive.');
  if (!(p.width > 0) || !(p.length > 0)) e.push('Width and Length must be positive.');
  else if (t > 0 && (p.width <= 2 * (t + 5) || p.length <= 2 * (t + 5)))
    e.push(`Width and Length must exceed ${(2 * (t + 5)).toFixed(1)} mm.`);
  if (p.kind === 'rectangle') {
    if (t > 0 && p.width > 0 && p.length > 0 && (p.cornerRadius < 2 * t || p.cornerRadius > Math.min(p.width, p.length) / 2))
      e.push(`Corner Radius must be between ${(2 * t).toFixed(1)} mm (twice the wall) and half the shorter side.`);
  } else if (t > 0 && p.width > 0 && p.length > 0) {
    const a = Math.max(p.width, p.length) / 2, b = Math.min(p.width, p.length) / 2;
    if ((b * b) / a < 2 * t)
      e.push('The ellipse is too pointed at its ends: make it rounder or reduce Wall Thickness (end radius must be at least twice the wall).');
  }
  if (!(p.height >= 20)) e.push('Height must be at least 20 mm.');
  if (p.height < FOOT + 5) e.push(`No room for the foot and 5 mm of pattern: raise Height above ${FOOT + 5} mm.`);
  if (!(p.lightHeight > 0)) e.push('Light Height must be positive.');
  else if (p.height >= p.lightHeight - 1) e.push('Light Height must be at least 1 mm above Height.');
  if (!(p.shadowSize > 0)) e.push('Shadow Size must be positive.');
  if (!(p.imageScale >= 10 && p.imageScale <= 300)) e.push('Image Size must be between 10 % and 300 %.');
  if (!(p.threshold >= 0 && p.threshold <= 255)) e.push('Threshold must be between 0 and 255.');
  if (!(p.edgeRounding >= 0 && p.edgeRounding <= 40)) e.push('Edge Rounding must be between 0 and 40.');
  if (p.minFeature < 0) e.push('Min Feature cannot be negative.');
  if (e.length) return e;

  const outline = buildOutline(p);
  if (p.base) {
    const be = validateBase(baseSpecOf(p), outline);
    if (be.length) return be;
  }
  const foot = footHeightFor(outline, p.lightHeight);
  if (foot + 5 > p.height)
    return [`No room for the foot and 5 mm of pattern: this shape needs a ${foot.toFixed(1)} mm foot; raise Height above ${(foot + 5).toFixed(1)} mm or make the shape rounder / the wall thinner.`];
  const g = deriveGeometry(p);
  const o = g.outline;
  // The ray taper must keep the outer surface monotone in z, in every column.
  fold: for (let i = 0; i < o.cols; i++) {
    let prev = outerHeightAt(g, p, o.sRay[i], 0);
    for (let q = 1; q <= 200; q++) {
      const cur = outerHeightAt(g, p, o.sRay[i], (p.height * q) / 200);
      if (cur <= prev) { e.push('Wall taper folds the outer surface; reduce Wall Thickness or lower the Height.'); break fold; }
      prev = cur;
    }
  }
  return e;
}

/** Solid foot height: like Tealight, tall enough that the ray taper (outer / inner scale sMax) cannot fold the outer surface. */
function footHeightFor(o: Outline, hf: number): number {
  let sMax = 1;
  for (let i = 0; i < o.cols; i++) sMax = Math.max(sMax, o.sRay[i]);
  return Math.max(FOOT, 1.25 * (sMax - 1) * hf);
}

export function deriveGeometry(p: ShadowWallParams): ShadowWallGeometry {
  const outline = buildOutline(p);
  const cell = outline.perimeter / outline.cols;
  const hf = p.lightHeight, G = groundDrop(p);
  let dMax = 0;
  for (let i = 0; i < outline.cols; i++) dMax = Math.max(dMax, outline.dIn[i]);
  const zTop = p.height;
  const foot = footHeightFor(outline, hf);

  const zs: number[] = [];
  const nFoot = Math.max(2, Math.ceil(foot / cell));
  for (let q = 0; q < nFoot; q++) zs.push((foot * q) / nFoot);
  const bandStart = zs.length;

  // Band, up to the top edge: the table position moves at most one cell per row in every direction (dz = cell (hf - z)^2 / (dMax (hf + G))).
  const band = (factor: number): number[] => {
    const out = [foot];
    let z = foot;
    for (;;) {
      const dz = (factor * cell * (hf - z) ** 2) / (dMax * (hf + G));
      if (z + dz * 1.5 >= zTop) break;
      z += dz;
      out.push(z);
    }
    out.push(zTop);
    return out;
  };
  let factor = 1, rows = band(factor);
  while (rows.length > MAX_ROWS - 100 && factor < 1e6) { factor *= 1.15; rows = band(factor); }
  for (const z of rows) zs.push(z);
  const bandEnd = zs.length - 1;

  return { outline, zs: Float64Array.from(zs), footRows: nFoot, bandStart, bandEnd, blendBottom: foot, blendTop: zTop };
}

export interface ShadowWallField {
  geometry: ShadowWallGeometry;
  field: Float32Array; // index i + cols * j, > 0 solid
  report: { specksRemoved: number; floatingRemoved: number };
}

/** Luminance 0..1 of the image under table position (X, Y); outside the canvas = 1 (light). */
function luminanceAt(img: GrayImage, p: ShadowWallParams, k: number, X: number, Y: number): number {
  const a = (p.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = X - p.offsetX, dy = Y - p.offsetY;
  const x = dx * c + dy * s, y = -dx * s + dy * c;
  const cx = img.width / 2 + x / k, cy = img.height / 2 - y / k; // continuous coords, pixel edges at integers
  if (cx < 0 || cy < 0 || cx > img.width || cy > img.height) return 1;
  return sampleBilinear(img, (cx - 0.5) / (img.width - 1), (cy - 0.5) / (img.height - 1));
}

export function buildField(img: GrayImage, p: ShadowWallParams): ShadowWallField {
  const g = deriveGeometry(p);
  const o = g.outline;
  const C = o.cols, zs = g.zs, rowsN = zs.length;
  const nb = g.bandEnd - g.bandStart + 1;
  const hf = p.lightHeight, G = groundDrop(p);
  const k = (p.shadowSize * (p.imageScale / 100)) / Math.max(img.width, img.height);

  const lum = new Float32Array(C * nb);
  for (let jb = 0; jb < nb; jb++) {
    const s = tableScale(hf, G, zs[g.bandStart + jb]);
    for (let i = 0; i < C; i++) lum[i + C * jb] = luminanceAt(img, p, k, o.qx[i] * s, o.qy[i] * s);
  }
  const blurred = gaussianBlur(lum, C, nb, p.edgeRounding / 10);

  const field = new Float32Array(C * rowsN).fill(255);
  for (let jb = 0; jb < nb; jb++)
    for (let i = 0; i < C; i++) {
      const v = blurred[i + C * jb] * 255 - p.threshold; // > 0 where light
      field[i + C * (g.bandStart + jb)] = p.invert ? v : -v;
    }

  const solid = (): Uint8Array => {
    const m = new Uint8Array(field.length);
    for (let i = 0; i < m.length; i++) m[i] = field[i] > 0 ? 1 : 0;
    return m;
  };
  const inBand = (j: number) => j >= g.bandStart && j <= g.bandEnd;
  const flip = (idx: number, toSolid: boolean) => {
    const mag = Math.max(Math.abs(field[idx]), 1);
    field[idx] = toSolid ? mag : -mag;
  };
  const cell = o.perimeter / C;
  const nodeArea = (idx: number) => {
    const j = Math.floor(idx / C);
    const jl = Math.max(g.bandStart, j - 1), jh = Math.min(g.bandEnd, j + 1);
    return cell * ((zs[jh] - zs[jl]) / 2);
  };
  const report = { specksRemoved: 0, floatingRemoved: 0 };

  // 1. Minimum feature: drop tiny holes and tiny loose solid specks.
  if (p.minFeature > 0) {
    const minArea = Math.PI * (p.minFeature / 2) ** 2;
    for (const value of [0, 1]) {
      const { labels, count } = labelComponents(solid(), C, rowsN, value);
      const area = new Float64Array(count);
      const touchesOutside = new Uint8Array(count);
      for (let idx = 0; idx < labels.length; idx++) {
        const l = labels[idx];
        if (l < 0) continue;
        if (!inBand(Math.floor(idx / C))) touchesOutside[l] = 1; else area[l] += nodeArea(idx); // touches the foot
      }
      for (let idx = 0; idx < labels.length; idx++) {
        const l = labels[idx];
        if (l < 0 || touchesOutside[l] || area[l] >= minArea) continue;
        flip(idx, value === 0);
      }
      for (let l = 0; l < count; l++) if (!touchesOutside[l] && area[l] < minArea) report.specksRemoved++;
    }
  }

  // 2. Floating solid pieces (not connected to the foot) would fall out: make them holes. Touching the top edge does not hold a piece.
  {
    const { labels, count } = labelComponents(solid(), C, rowsN, 1);
    const anchored = new Uint8Array(count);
    for (let idx = 0; idx < labels.length; idx++) if (labels[idx] >= 0 && Math.floor(idx / C) < g.bandStart) anchored[labels[idx]] = 1;
    for (let idx = 0; idx < labels.length; idx++) if (labels[idx] >= 0 && !anchored[labels[idx]]) flip(idx, false);
    for (let l = 0; l < count; l++) if (!anchored[l]) report.floatingRemoved++;
  }

  return { geometry: g, field, report };
}

// ---- meshing ---------------------------------------------------------------------------------

export interface ShadowWallResult {
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  geometry: ShadowWallGeometry;
  field: Float32Array;
  report: ShadowWallField['report'] & {
    check: MeshCheck;
    warnings: string[];
    ms: number;
  };
}

/**
 * Inner and outer surface maps (theta, z) -> point. theta = 2 pi u / cols with u a (fractional) sample
 * index, periodic; points between samples are linear. Across the pattern band the outer point is where the
 * ray from the light through the inner point leaves the outer outline; at the foot it blends to the
 * outer outline point p at the same height. There is no top blend: the surface follows the ray to the top edge.
 */
export function surfaceMaps(g: ShadowWallGeometry, p: Pick<ShadowWallParams, 'height' | 'lightHeight'>): { inner: SurfaceMap; outer: SurfaceMap } {
  const o = g.outline, C = o.cols;
  const at = (arr: Float64Array, theta: number): number => {
    const u = (theta / (2 * Math.PI)) * C;
    const fl = Math.floor(u + 1e-9);
    const i0 = ((fl % C) + C) % C, i1 = (i0 + 1) % C;
    const t = Math.min(Math.max(u - fl, 0), 1);
    return arr[i0] * (1 - t) + arr[i1] * t;
  };
  return {
    inner: (th, z) => [at(o.qx, th), at(o.qy, th), z],
    outer: (th, z) => {
      const s = at(o.sRay, th), w = blendWeight(g, p, z);
      const qx = at(o.qx, th), qy = at(o.qy, th), px = at(o.px, th), py = at(o.py, th);
      return [px + w * (qx * s - px), py + w * (qy * s - py), outerHeightAt(g, p, s, z)];
    },
  };
}

const LARGE_MODEL = 3_000_000;

export function largeModelWarning(triangles: number): string | null {
  if (triangles <= LARGE_MODEL) return null;
  return `Very large model (${(triangles / 1e6).toFixed(1)} million triangles): slicing and the preview will be slow; increase the footprint's cell size by making the shape smaller, or reduce the wall height.`;
}

const REACH_BINS = 720;
/** Table reach per direction bin: the inner outline's distance in that direction, projected from the light to the top edge (z = height). */
function reachProfile(p: ShadowWallParams, o: Outline): Float64Array {
  const reach = new Float64Array(REACH_BINS);
  const scale = tableScale(p.lightHeight, groundDrop(p), p.height);
  for (let b = 0; b < REACH_BINS; b++) {
    const dx = Math.cos((2 * Math.PI * b) / REACH_BINS), dy = Math.sin((2 * Math.PI * b) / REACH_BINS);
    let best = Infinity;
    for (let i = 0; i < o.cols; i++) {
      const j = (i + 1) % o.cols;
      const ex = o.qx[j] - o.qx[i], ey = o.qy[j] - o.qy[i];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const s = (o.qx[i] * ey - o.qy[i] * ex) / den;
      const u = (o.qx[i] * dy - o.qy[i] * dx) / den;
      if (s > 0 && u >= -1e-12 && u <= 1 + 1e-12) best = Math.min(best, s);
    }
    reach[b] = best * scale;
  }
  return reach;
}

/** Dark pixels (the mask the warning and the fit use: threshold and invert on the raw pixels) as table offsets from the image centre, before the image offsets and at the current size. */
function darkOffsets(img: GrayImage, p: ShadowWallParams): { rx: Float64Array; ry: Float64Array } {
  const k = (p.shadowSize * (p.imageScale / 100)) / Math.max(img.width, img.height);
  const a = (p.rotation * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const rx: number[] = [], ry: number[] = [];
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const v = img.pixels[y * img.width + x] * 255 - p.threshold; // > 0 light
      if (p.invert ? !(v > 0) : !(v < 0)) continue;
      const ix = (x + 0.5 - img.width / 2) * k, iy = -(y + 0.5 - img.height / 2) * k;
      rx.push(ix * c - iy * sn); ry.push(ix * sn + iy * c);
    }
  return { rx: Float64Array.from(rx), ry: Float64Array.from(ry) };
}

/** Fraction of the dark pixels beyond reach once the shadow is scaled by `ratio` about the axis (offsets stay in millimetres); a pixel counts as beyond reach past `margin` * reach. */
function farFraction(d: { rx: Float64Array; ry: Float64Array }, reach: Float64Array, p: ShadowWallParams, ratio: number, margin: number): number {
  let far = 0;
  for (let n = 0; n < d.rx.length; n++) {
    const X = d.rx[n] * ratio + p.offsetX, Y = d.ry[n] * ratio + p.offsetY;
    let ang = Math.atan2(Y, X);
    if (ang < 0) ang += 2 * Math.PI;
    if (Math.hypot(X, Y) > reach[Math.round((ang / (2 * Math.PI)) * REACH_BINS) % REACH_BINS] * margin) far++;
  }
  return d.rx.length === 0 ? 0 : far / d.rx.length;
}

/** Fraction of the image's dark pixels that lie farther from the axis than the wall can reach (up to its top edge) in their direction. */
function unreachedFraction(img: GrayImage, p: ShadowWallParams, g: ShadowWallGeometry): number {
  return farFraction(darkOffsets(img, p), reachProfile(p, g.outline), p, 1, 1);
}

export const MIN_SHADOW_SIZE = 100; // the Shadow Size control's lower limit
/** Clearance kept when fitting, so the edge pixels are safely inside the reach. */
const FIT_MARGIN = 0.99;

/**
 * Largest Shadow Size (5 mm steps, never above the current one) at which no dark pixel lies beyond the wall's
 * reach (up to its top edge). The current size is kept when it already fits. `ok` is false when even the
 * smallest size (100 mm) cannot fit, e.g. a shape moved far off the axis; the size is then that smallest one.
 * The part nearest the axis is always hidden under the base and the foot: a physical limit that shrinking does not change.
 */
export function fitShadowSize(img: GrayImage, p: ShadowWallParams): { shadowSize: number; ok: boolean } {
  const reach = reachProfile(p, buildOutline(p));
  const d = darkOffsets(img, p);
  const fits = (size: number) => farFraction(d, reach, p, size / p.shadowSize, FIT_MARGIN) === 0;
  if (fits(p.shadowSize)) return { shadowSize: p.shadowSize, ok: true };
  for (let size = Math.floor((p.shadowSize - 1e-9) / 5) * 5; size >= MIN_SHADOW_SIZE; size -= 5)
    if (fits(size)) return { shadowSize: size, ok: true };
  return { shadowSize: Math.min(MIN_SHADOW_SIZE, p.shadowSize), ok: false };
}

export function generateShadowWall(img: GrayImage, p: ShadowWallParams, runChecks = true): ShadowWallResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const errors = validateShadowWallParams(p);
  if (errors.length) throw new Error(errors.join(' '));

  const { geometry: g, field, report } = buildField(img, p);
  const o = g.outline;
  const C = o.cols;
  const mb = new MeshBuilder();

  const { inner: innerMap, outer: outerMap } = surfaceMaps(g, p);

  const shell = buildShell(mb, { cols: C, zs: g.zs, field, inner: innerMap, outer: outerMap }, { skipBottomBorder: p.base });
  if (p.base) {
    addBase(mb, shell.bottomInner, shell.bottomOuter, baseSpecOf(p));
    for (let v = 2; v < mb.positions.length; v += 3) mb.positions[v] += p.baseThickness; // rest the plate on z = 0
  }
  const { positions, indices } = mb.toArrays();
  const check = runChecks
    ? checkMesh(positions, indices)
    : { triangleCount: indices.length / 3, watertight: true, badEdges: 0, degenerateTriangles: 0, signedVolume: 0, errors: [] };

  const warnings: string[] = [];
  let anySolid = false;
  for (let j = g.bandStart; j <= g.bandEnd && !anySolid; j++)
    for (let i = 0; i < C; i++) if (field[i + C * j] > 0) { anySolid = true; break; }
  if (!anySolid && report.floatingRemoved === 0) warnings.push('Nothing is shadowed: the image has no dark area inside the wall (check Threshold, Invert, Image Size and Offsets).');
  if (unreachedFraction(img, p, g) > 0.02)
    warnings.push("Part of the shadow image lies beyond the wall's reach and is not reproduced (the part closest to the axis is always hidden under the base and foot). Try Fit shadow to the wall.");
  const large = largeModelWarning(indices.length / 3);
  if (large) warnings.push(large);
  if (report.floatingRemoved > 0)
    warnings.push(`${report.floatingRemoved} floating solid piece(s) were removed because they would fall out.`);
  if (p.minFeature > 0 && report.specksRemoved > 0)
    warnings.push(`${report.specksRemoved} feature(s) smaller than ${p.minFeature} mm were dropped.`);

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    positions,
    indices,
    triangleCount: indices.length / 3,
    geometry: g,
    field,
    report: { ...report, check, warnings, ms: t1 - t0 },
  };
}
