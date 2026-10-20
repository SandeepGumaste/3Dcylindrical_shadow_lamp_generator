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
};

export const FOOT = 3; // mm of solid foot band
export const RIM = 2;  // mm of solid top rim
const MAX_ROWS = 1500;

export interface ShadowWallGeometry {
  outline: Outline;
  zs: Float64Array;       // node row heights, strictly increasing from 0 to height
  footRows: number;       // rows 0 .. footRows - 1 are the foot
  bandStart: number;      // first node row of the pattern band (z = FOOT)
  bandEnd: number;        // last node row of the pattern band (z = height - RIM)
  rimStart: number;       // first rim row
  blendBottom: number;    // top of the solid foot = top of the foot blend zone (max(FOOT, 1.25 (sMax - 1) hf))
  blendTop: number;       // top of the pattern band
}

/** Outer-surface height for an inner-surface height z at a column whose outer / inner distances are dOut / dIn. */
export function outerHeightAt(g: Pick<ShadowWallGeometry, 'blendBottom' | 'blendTop'>, p: Pick<ShadowWallParams, 'height' | 'lightHeight'>, dOut: number, dIn: number, z: number): number {
  const w = z < g.blendBottom ? z / g.blendBottom : z <= g.blendTop ? 1 : Math.max(0, (p.height - z) / (p.height - g.blendTop));
  return z + w * (p.lightHeight - z) * (1 - dOut / dIn);
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
  if (p.height < FOOT + RIM + 5) e.push(`No room for the foot, rim and 5 mm of pattern: raise Height above ${FOOT + RIM + 5} mm.`);
  if (!(p.lightHeight > 0)) e.push('Light Height must be positive.');
  else if (p.height >= p.lightHeight - 1) e.push('Light Height must be at least 1 mm above Height.');
  if (!(p.shadowSize > 0)) e.push('Shadow Size must be positive.');
  if (!(p.imageScale >= 10 && p.imageScale <= 300)) e.push('Image Size must be between 10 % and 300 %.');
  if (!(p.threshold >= 0 && p.threshold <= 255)) e.push('Threshold must be between 0 and 255.');
  if (!(p.edgeRounding >= 0 && p.edgeRounding <= 40)) e.push('Edge Rounding must be between 0 and 40.');
  if (p.minFeature < 0) e.push('Min Feature cannot be negative.');
  if (e.length) return e;

  const outline = buildOutline(p);
  const foot = footHeightFor(outline, p.lightHeight);
  if (foot + RIM + 5 > p.height)
    return [`No room for the foot, rim and 5 mm of pattern: this shape needs a ${foot.toFixed(1)} mm foot; raise Height above ${(foot + RIM + 5).toFixed(1)} mm or make the shape rounder / the wall thinner.`];
  const g = deriveGeometry(p);
  const o = g.outline;
  // The ray taper must keep the outer surface monotone in z, in every column.
  fold: for (let i = 0; i < o.cols; i++) {
    let prev = outerHeightAt(g, p, o.dOut[i], o.dIn[i], 0);
    for (let q = 1; q <= 200; q++) {
      const cur = outerHeightAt(g, p, o.dOut[i], o.dIn[i], (p.height * q) / 200);
      if (cur <= prev) { e.push('Wall taper folds the outer surface; reduce Wall Thickness or lower the Height.'); break fold; }
      prev = cur;
    }
  }
  return e;
}

/** Solid foot height: like Tealight, tall enough that the ray taper (outer / inner scale sMax) cannot fold the outer surface. */
function footHeightFor(o: Outline, hf: number): number {
  let sMax = 1;
  for (let i = 0; i < o.cols; i++) sMax = Math.max(sMax, o.dOut[i] / o.dIn[i]);
  return Math.max(FOOT, 1.25 * (sMax - 1) * hf);
}

export function deriveGeometry(p: ShadowWallParams): ShadowWallGeometry {
  const outline = buildOutline(p);
  const cell = outline.perimeter / outline.cols;
  const hf = p.lightHeight;
  let dMax = 0;
  for (let i = 0; i < outline.cols; i++) dMax = Math.max(dMax, outline.dIn[i]);
  const zTop = p.height - RIM;
  const foot = footHeightFor(outline, hf);

  const zs: number[] = [];
  const nFoot = Math.max(2, Math.ceil(foot / cell));
  for (let q = 0; q < nFoot; q++) zs.push((foot * q) / nFoot);
  const bandStart = zs.length;

  // Band: the table position moves at most one cell per row in every direction (dz = cell (hf - z)^2 / (dMax hf)).
  const band = (factor: number): number[] => {
    const out = [foot];
    let z = foot;
    for (;;) {
      const dz = (factor * cell * (hf - z) ** 2) / (dMax * hf);
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
  const rimStart = zs.length;
  const nRim = Math.max(2, Math.ceil(RIM / cell));
  for (let q = 1; q <= nRim; q++) zs.push(zTop + (RIM * q) / nRim);
  zs[zs.length - 1] = p.height;

  return { outline, zs: Float64Array.from(zs), footRows: nFoot, bandStart, bandEnd, rimStart, blendBottom: foot, blendTop: zTop };
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
  const hf = p.lightHeight;
  const k = (p.shadowSize * (p.imageScale / 100)) / Math.max(img.width, img.height);

  const lum = new Float32Array(C * nb);
  for (let jb = 0; jb < nb; jb++) {
    const s = hf / (hf - zs[g.bandStart + jb]);
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
        if (!inBand(Math.floor(idx / C))) touchesOutside[l] = 1; else area[l] += nodeArea(idx);
      }
      for (let idx = 0; idx < labels.length; idx++) {
        const l = labels[idx];
        if (l < 0 || touchesOutside[l] || area[l] >= minArea) continue;
        flip(idx, value === 0);
      }
      for (let l = 0; l < count; l++) if (!touchesOutside[l] && area[l] < minArea) report.specksRemoved++;
    }
  }

  // 2. Floating solid pieces (not connected to the foot or the rim) would fall out: make them holes.
  {
    const { labels, count } = labelComponents(solid(), C, rowsN, 1);
    const anchored = new Uint8Array(count);
    for (let idx = 0; idx < labels.length; idx++) if (labels[idx] >= 0 && !inBand(Math.floor(idx / C))) anchored[labels[idx]] = 1;
    for (let idx = 0; idx < labels.length; idx++) if (labels[idx] >= 0 && !anchored[labels[idx]]) flip(idx, false);
    for (let l = 0; l < count; l++) if (!anchored[l]) report.floatingRemoved++;
  }

  return { geometry: g, field, report };
}
