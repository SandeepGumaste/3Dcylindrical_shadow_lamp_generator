/**
 * Tealight shade: a truncated cone that stands over a tealight and throws the input image onto
 * the table around it. Pure functions only (no DOM / three.js) so this can run in a worker.
 *
 * Coordinates: table is z = 0, axis is z, theta runs counter-clockwise seen from above (x right,
 * y up in the table view), so the shadow is not mirrored.
 */
import { contourShapes, smoothPath } from './outline';
import type { GrayImage } from '../types';
import { MeshBuilder, buildShell } from './shellMesh';
import { checkMesh, MeshCheck } from './meshCheck';
import { DEFAULT_TEALIGHT_PARAMS, LED_CLEARANCE, type TealightParams } from '../contracts/tealight';
import type { FieldReport, RibSuggestion, ShadowComparison } from '../contracts/outputs';
export { DEFAULT_TEALIGHT_PARAMS, LED_CLEARANCE };
export type { TealightParams, FieldReport, RibSuggestion, ShadowComparison };


export const LIP_WIDTH = 1.5;      // how far the socket lip reaches in under the LED body
const FOOT_MIN = 3;         // mm of solid foot band

export interface TealightGeometry {
  Rb: number;               // inner radius at z = 0
  k: number;                // dR/dz of the cone
  H: number;
  wall: number;
  hf: number;               // light height
  s: number;                // outer/inner ray scale about the light: 1 + wall / R(hf)
  lipT: number;             // height of the LED seat above the top rim (wall thickness plus the 45 degree chamfer)
  baseBand: number;         // top of the solid foot band
  zmax: number;             // top of the pattern band
  zs: Float64Array;         // grid node heights
  bandStart: number;        // node row at z = baseBand
  bandEnd: number;          // node row at z = zmax
  baseBand0: number;        // top of the solid foot (= baseBand when there is no bottom gap)
  openLo: number;           // first node row of the pattern plus its open bands (ribs run through these rows)
  openHi: number;           // last node row of the pattern plus its open bands
  cols: number;
}

// ---- formulas -----------------------------------------------------------------------------

export const coneRadius = (Rb: number, k: number, z: number) => Rb + k * z;

/** Where the ray from the light through the inner wall point at height z lands on the table. */
export const tableRadiusAt = (g: Pick<TealightGeometry, 'Rb' | 'k' | 'hf'>, z: number) =>
  ((g.Rb + g.k * z) * g.hf) / (g.hf - z);

/** Inverse of tableRadiusAt: wall height whose ray lands at table radius r. */
export const wallHeightForTableRadius = (g: Pick<TealightGeometry, 'Rb' | 'k' | 'hf'>, r: number) =>
  (g.hf * (r - g.Rb)) / (r + g.k * g.hf);

/** Height at which r(z) = Rs, unclamped. */
export const zMaxFormula = (Rb: number, k: number, hf: number, Rs: number) =>
  (hf * (Rs - Rb)) / (Rs + k * hf);

/** Outer-surface height for an inner-surface height z (ray taper, blended to zero at the rims). */
export function outerHeight(g: TealightGeometry, z: number): number {
  const zA = g.baseBand;
  const zT = g.zmax;
  const w = z < zA ? z / zA : z <= zT ? 1 : Math.max(0, (g.H - z) / (g.H - zT));
  return z + w * (g.s - 1) * (z - g.hf);
}

/**
 * Radial height of the triangular support rib at (theta, z). Each rib is an isosceles triangle in
 * cross-section: base = ribWidth on the inner wall, apex pointing inward, equilateral proportions
 * (height = ribWidth * sqrt(3) / 2). The ribs sit inside the forced-solid strips, so they never
 * clip a light ray (the triangle narrows toward the axis faster than the light sector does); they fade out above the pattern band so the top rim stays clean.
 */
/** Rib centre angles: explicit positions if given, else `ribs` evenly spaced from angle 0. */
export function ribAngleList(p: Pick<TealightParams, 'ribs' | 'ribAngles'>): number[] {
  if (p.ribAngles) return p.ribAngles;
  return Array.from({ length: Math.max(0, p.ribs) }, (_, n) => (2 * Math.PI * n) / p.ribs);
}

export function ribBump(g: TealightGeometry, p: TealightParams, theta: number, z: number, radius: number): number {
  if (p.ribs <= 0 || p.ribWidth <= 0) return 0;
  const taper = z <= g.zmax ? 1 : Math.max(0, (g.H - z) / (g.H - g.zmax));
  if (taper === 0) return 0;
  let arc = Infinity;
  for (const a of ribAngleList(p)) arc = Math.min(arc, Math.abs(angDiff(theta, a)) * radius);
  const half = p.ribWidth / 2;
  if (arc >= half) return 0;
  return taper * ((p.ribWidth * Math.sqrt(3)) / 2) * (1 - arc / half);
}

export function deriveGeometry(p: TealightParams): TealightGeometry {
  const Rb = p.innerDiameter / 2;
  const Rt = p.topDiameter / 2;
  const H = p.height;
  const k = (Rt - Rb) / H;
  const wall = p.wallThickness;
  // LED socket: the lip under the LED body is a 45 degree cone from the shade's inner rim, so it prints without
  // support; lipT is the height of the LED seat above the rim.
  const lipR = (p.tealightDiameter + LED_CLEARANCE) / 2 - LIP_WIDTH;
  const lipT = wall + (p.useLed ? Math.max(0, Rt - lipR) : 0);
  const hf = p.useLed ? H + lipT - p.ledTipHeight : p.flameHeight;
  const s = 1 + wall / (Rb + k * hf);
  const ventNeed = p.vents > 0 ? p.ventSize + 1.5 : 0;
  const baseBand0 = Math.max(FOOT_MIN, ventNeed, 1.25 * (s - 1) * hf);
  const gapB = Math.max(0, p.patternGapBottom), gapT = Math.max(0, p.patternGapTop);
  const baseBand = baseBand0 + gapB;

  let zmax = zMaxFormula(Rb, k, hf, p.shadowRadius);
  zmax = Math.min(zmax, hf - 1, H - 2 - gapT);

  const cols = p.cols;
  const zs: number[] = [];
  const dzFoot = (2 * Math.PI * Rb) / cols;
  const nFoot = Math.max(2, Math.ceil(baseBand / dzFoot));
  for (let q = 0; q < nFoot; q++) zs.push((baseBand * q) / nFoot);
  const bandStart = zs.length;

  const g0: Pick<TealightGeometry, 'Rb' | 'k' | 'hf'> = { Rb, k, hf };
  const r0 = tableRadiusAt(g0, baseBand);
  const r1 = tableRadiusAt(g0, zmax);
  const growth = 1 + Math.PI / cols; // ~two rows per column width on the table
  const n = Math.min(1500, Math.max(4, Math.ceil(Math.log(r1 / r0) / Math.log(growth))));
  for (let q = 0; q <= n; q++) {
    if (q === 0) zs.push(baseBand);
    else if (q === n) zs.push(zmax);
    else zs.push(wallHeightForTableRadius(g0, r0 * Math.pow(r1 / r0, q / n)));
  }
  const bandEnd = zs.length - 1;
  if (gapT > 0) {
    // rows through the open band above the pattern, up to the solid rim
    const dzTop = (2 * Math.PI * coneRadius(Rb, k, H)) / cols;
    const nTop = Math.max(2, Math.ceil((H - zmax) / dzTop));
    for (let q = 1; q < nTop; q++) zs.push(zmax + ((H - zmax) * q) / nTop);
  }
  zs.push(H);
  const rowOf = (z: number) => zs.findIndex((v) => v >= z - 1e-9);
  const openLo = gapB > 0 ? rowOf(baseBand0) : bandStart;
  let openHi = bandEnd;
  if (gapT > 0) for (let j = bandEnd; j < zs.length - 1; j++) if (zs[j] <= zmax + gapT + 1e-9) openHi = j;

  return { Rb, k, H, wall, hf, s, lipT, baseBand, baseBand0, openLo, openHi, zmax, zs: Float64Array.from(zs), bandStart, bandEnd, cols };
}

export function validateTealightParams(p: TealightParams): string[] {
  const e: string[] = [];
  if (p.innerDiameter <= p.tealightDiameter + 4)
    e.push(`Inner Diameter must exceed tealight diameter + 4 mm (> ${p.tealightDiameter + 4} mm).`);
  if (!(p.wallThickness > 0)) e.push('Wall Thickness must be positive.');
  if (p.patternGapTop < 0 || p.patternGapBottom < 0) e.push('Open bands above / below the pattern cannot be negative.');
  if ((p.patternGapTop > 0 || p.patternGapBottom > 0) && !p.autoRibs && p.ribs < 3)
    e.push('Open bands above / below the pattern need at least 3 ribs to hold the shade together.');
  if (p.topDiameter <= 0) e.push('Top Diameter must be positive.');
  if (p.height <= 10) e.push('Height must be above 10 mm.');
  if (p.cols < 60 || p.cols > 1440) e.push('Resolution must be between 60 and 1440 columns.');
  if (!p.useLed && p.flameHeight >= p.height) e.push('Flame Height must be below Height.');
  if (p.shadowRadius <= p.innerDiameter / 2) e.push('Shadow Radius must exceed the bottom radius.');
  if (!(p.imageScale >= 10 && p.imageScale <= 300)) e.push('Image Size must be between 10 % and 300 %.');
  if (Math.abs(p.imageOffsetX) > p.shadowRadius || Math.abs(p.imageOffsetY) > p.shadowRadius) e.push('Image offset cannot exceed the Shadow Size radius.');
  if (p.ribs < 0 || p.vents < 0) e.push('Ribs and vents cannot be negative.');
  if (!(p.maxBridge > 0)) e.push('Max bridge span must be positive.');
  if (p.closeBottom && !(p.floorThickness >= 0.2)) e.push('Floor Thickness must be at least 0.2 mm.');
  if (p.closeBottom && p.vents > 0) e.push('Base vents need an open bottom; turn off Close Bottom or set vents to 0.');
  if (p.vents > 0 && p.vents * (p.ventSize + 2) > Math.PI * p.innerDiameter)
    e.push('Base vents do not fit around the base; reduce count or size.');
  if (p.useLed) {
    const a = (p.tealightDiameter + LED_CLEARANCE) / 2;
    if (p.topDiameter / 2 < a - LIP_WIDTH + 0.5)
      e.push(`Top Diameter is too small to carry the LED socket (needs >= ${(2 * (a - LIP_WIDTH + 0.5)).toFixed(1)} mm).`);
    if (p.ledTipHeight <= 0) e.push('LED Tip Height must be positive.');
  }
  if (e.length) return e;

  const g = deriveGeometry(p);
  if (g.hf < g.baseBand + 3) e.push('Light is too low: raise Flame Height (or lower LED Tip Height).');
  else if (g.zmax - g.baseBand < 1)
    e.push('No room left for the pattern: increase Shadow Radius, or reduce the open bands or the foot band.');
  else {
    // The ray taper must keep the outer surface monotone in z.
    let prev = outerHeight(g, 0);
    for (let q = 1; q <= 200; q++) {
      const cur = outerHeight(g, (g.H * q) / 200);
      if (cur <= prev) { e.push('Wall taper folds the outer surface; reduce Wall Thickness.'); break; }
      prev = cur;
    }
  }
  return e;
}

// ---- field construction ---------------------------------------------------------------------

/** Pixel-centre bilinear luminance sample at continuous pixel coords; outside the image = 1 (white). */
function sampleLum(img: GrayImage, px: number, py: number): number {
  const { width: w, height: h, pixels } = img;
  if (px < 0 || py < 0 || px > w || py > h) return 1;
  const x = Math.min(Math.max(px - 0.5, 0), w - 1);
  const y = Math.min(Math.max(py - 0.5, 0), h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const tx = x - x0, ty = y - y0;
  const top = pixels[y0 * w + x0] * (1 - tx) + pixels[y0 * w + x1] * tx;
  const bot = pixels[y1 * w + x0] * (1 - tx) + pixels[y1 * w + x1] * tx;
  return top * (1 - ty) + bot * ty;
}

/** Table position (mm, x right / y up) to continuous pixel coords: shorter image side spans the disk. */
export function tableToPixel(img: GrayImage, Rs: number, x: number, y: number): [number, number] {
  const S = Math.min(img.width, img.height);
  return [img.width / 2 + (x / (2 * Rs)) * S, img.height / 2 - (y / (2 * Rs)) * S];
}
export function pixelToTable(img: GrayImage, Rs: number, px: number, py: number): [number, number] {
  const S = Math.min(img.width, img.height);
  return [((px - img.width / 2) / S) * 2 * Rs, -((py - img.height / 2) / S) * 2 * Rs];
}

function luminanceAt(img: GrayImage, Rs: number, x: number, y: number, invert: boolean): number {
  const [px, py] = tableToPixel(img, Rs, x, y);
  const l = sampleLum(img, px, py);
  return invert ? 1 - l : l;
}

export function gaussianBlur(src: Float32Array, W: number, Hh: number, sigma: number): Float32Array {
  if (sigma < 0.05) return src;
  const rad = Math.max(1, Math.ceil(3 * sigma));
  const ker = new Float32Array(2 * rad + 1);
  let sum = 0;
  for (let d = -rad; d <= rad; d++) { const v = Math.exp(-(d * d) / (2 * sigma * sigma)); ker[d + rad] = v; sum += v; }
  for (let d = 0; d < ker.length; d++) ker[d] /= sum;
  const tmp = new Float32Array(src.length);
  for (let j = 0; j < Hh; j++) {
    for (let i = 0; i < W; i++) {
      let a = 0;
      for (let d = -rad; d <= rad; d++) a += ker[d + rad] * src[(((i + d) % W) + W) % W + W * j]; // wraps in theta
      tmp[i + W * j] = a;
    }
  }
  const out = new Float32Array(src.length);
  for (let j = 0; j < Hh; j++) {
    for (let i = 0; i < W; i++) {
      let a = 0;
      for (let d = -rad; d <= rad; d++) a += ker[d + rad] * tmp[i + W * Math.min(Hh - 1, Math.max(0, j + d))];
      out[i + W * j] = a;
    }
  }
  return out;
}

/** 4-connected labelling (periodic in i) of nodes where mask[idx] === value. */
export function labelComponents(mask: Uint8Array, C: number, rowsN: number, value: number) {
  const labels = new Int32Array(mask.length).fill(-1);
  const queue = new Int32Array(mask.length);
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== value || labels[start] >= 0) continue;
    let head = 0, tail = 0;
    queue[tail++] = start; labels[start] = count;
    while (head < tail) {
      const idx = queue[head++];
      const i = idx % C, j = (idx - i) / C;
      const nb = [
        ((i + 1) % C) + C * j, ((i + C - 1) % C) + C * j,
        j + 1 < rowsN ? i + C * (j + 1) : -1, j > 0 ? i + C * (j - 1) : -1,
      ];
      for (const n of nb) {
        if (n >= 0 && mask[n] === value && labels[n] < 0) { labels[n] = count; queue[tail++] = n; }
      }
    }
    count++;
  }
  return { labels, count };
}


export interface TealightField {
  geometry: TealightGeometry;
  field: Float32Array;
  report: FieldReport;
}

const angDiff = (a: number, b: number) => {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

export function buildTealightField(img: GrayImage, p: TealightParams): TealightField {
  const g = deriveGeometry(p);
  const C = g.cols;
  const zs = g.zs;
  const rowsN = zs.length;
  const nb = g.bandEnd - g.bandStart + 1;
  const Rs = p.shadowRadius;
  const R = (z: number) => coneRadius(g.Rb, g.k, z);

  // Inverse sampling: wall node -> table (r, theta) -> image luminance.
  const lum = new Float32Array(C * nb);
  for (let jb = 0; jb < nb; jb++) {
    const r = tableRadiusAt(g, zs[g.bandStart + jb]);
    for (let i = 0; i < C; i++) {
      const th = (2 * Math.PI * i) / C;
      lum[i + C * jb] = r > Rs ? 1 : luminanceAt(img, Rs * (p.imageScale / 100), r * Math.cos(th) - p.imageOffsetX, r * Math.sin(th) - p.imageOffsetY, p.invert);
    }
  }
  const blurred = gaussianBlur(lum, C, nb, p.edgeRounding / 10);

  const field = new Float32Array(C * rowsN).fill(255);
  for (let jb = 0; jb < nb; jb++)
    for (let i = 0; i < C; i++) field[i + C * (g.bandStart + jb)] = blurred[i + C * jb] * 255 - p.threshold;

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
  const nodeArea = (idx: number) => {
    const j = Math.floor(idx / C);
    const jl = Math.max(g.bandStart, j - 1), jh = Math.min(g.bandEnd, j + 1);
    return ((2 * Math.PI * R(zs[j])) / C) * ((zs[jh] - zs[jl]) / 2);
  };
  const report: FieldReport = { specksRemoved: 0, islandsFound: 0, islandsBridged: 0, islandsRemaining: 0 };

  const anchoredOf = (labels: Int32Array, count: number) => {
    const anchored = new Uint8Array(count);
    for (let idx = 0; idx < labels.length; idx++) {
      if (labels[idx] >= 0 && !inBand(Math.floor(idx / C))) anchored[labels[idx]] = 1;
    }
    return anchored;
  };

  // 1. Minimum feature: drop tiny holes and tiny loose solid specks.
  if (p.minFeature > 0) {
    const minArea = Math.PI * (p.minFeature / 2) ** 2;
    for (const value of [0, 1]) {
      const m = solid();
      const { labels, count } = labelComponents(m, C, rowsN, value);
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

  // Open bands: full-width ring cut-outs just below and above the pattern (the ribs below re-join them).
  for (let j = g.openLo; j < g.bandStart; j++) for (let i = 0; i < C; i++) field[i + C * j] = -255;
  for (let j = g.bandEnd + 1; j <= g.openHi; j++) for (let i = 0; i < C; i++) field[i + C * j] = -255;
  if (g.openHi > g.bandEnd) {
    // The top pattern rows span a huge table radius in a tiny height; when they are all solid image margin they
    // would be a hair-thin ring cut off from the rim by the open band, so open them with the band.
    let j = g.bandEnd;
    const rowSolid = (r: number) => { for (let i = 0; i < C; i++) if (field[i + C * r] <= 0) return false; return true; };
    while (j >= g.bandStart && rowSolid(j)) { for (let i = 0; i < C; i++) field[i + C * j] = -255; j--; }
  }

  // 2. Support ribs: vertical strips forced solid across the pattern band and any open bands.
  if (p.ribs > 0) {
    const angles = ribAngleList(p);
    for (let j = g.openLo; j <= g.openHi; j++) {
      const half = p.ribWidth / (2 * R(zs[j]));
      for (let i = 0; i < C; i++) {
        const th = (2 * Math.PI * i) / C;
        for (const a of angles) {
          if (Math.abs(angDiff(th, a)) <= half + 1e-9) { flip(i + C * j, true); break; }
        }
      }
    }
  }

  // 3. Base vents: arches cut up from the bottom edge, centred between ribs.
  if (p.vents > 0) {
    const a = p.ventSize / 2;
    for (let j = 0; j < g.bandStart; j++) {
      const z = zs[j];
      for (let i = 0; i < C; i++) {
        const th = (2 * Math.PI * i) / C;
        for (let n = 0; n < p.vents; n++) {
          const arc = Math.abs(angDiff(th, (2 * Math.PI * (n + 0.5)) / p.vents)) * R(z);
          const zc = p.ventSize - a;
          const inside = z <= zc ? arc <= a : (arc / a) ** 2 + ((z - zc) / a) ** 2 <= 1;
          if (inside) { field[i + C * j] = -255; break; }
        }
      }
    }
  }

  // 4. Island check: solid regions not connected to the foot or top band.
  {
    let { labels, count } = labelComponents(solid(), C, rowsN, 1);
    let anchored = anchoredOf(labels, count);
    const islands: number[] = [];
    for (let l = 0; l < count; l++) if (!anchored[l]) islands.push(l);
    report.islandsFound = islands.length;

    if (p.autoBridge) {
      let guard = 0;
      while (guard++ < 400) {
        const un = anchoredOf(labels, count);
        const l = un.findIndex((v) => v === 0);
        if (l < 0) break;
        if (!bridgeIsland(l)) break;
        report.islandsBridged++;
        ({ labels, count } = labelComponents(solid(), C, rowsN, 1));
      }
      anchored = anchoredOf(labels, count);
    }
    let remaining = 0;
    for (let l = 0; l < count; l++) if (!anchored[l]) remaining++;
    report.islandsRemaining = remaining;

    function bridgeIsland(label: number): boolean {
      const thickMm = Math.max(0.8, p.minFeature);
      const anch = anchoredOf(labels, count);
      let best: { dist: number; i: number; j: number; di: number; dj: number; m: number } | null = null;
      for (let idx = 0; idx < labels.length; idx++) {
        if (labels[idx] !== label) continue;
        const i0 = idx % C, j0 = (idx - i0) / C;
        if (!inBand(j0)) continue;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const maxM = di !== 0 ? Math.floor(C / 2) : rowsN;
          for (let m = 1; m <= maxM; m++) {
            const i = (((i0 + di * m) % C) + C) % C;
            const j = j0 + dj * m;
            if (j < 0 || j >= rowsN) break;
            const l2 = labels[i + C * j];
            if (l2 === label) continue;
            if (l2 >= 0) {
              if (anch[l2]) {
                const dist = di !== 0 ? (m * 2 * Math.PI * R(zs[j0])) / C : Math.abs(zs[j] - zs[j0]);
                if (!best || dist < best.dist) best = { dist, i: i0, j: j0, di, dj, m };
              }
              break;
            }
          }
        }
      }
      if (!best) return false;
      const { i: i0, j: j0, di, dj, m } = best;
      if (di !== 0) {
        const rowsSel: number[] = [];
        for (let j = g.bandStart; j <= g.bandEnd; j++) if (Math.abs(zs[j] - zs[j0]) <= thickMm / 2) rowsSel.push(j);
        if (rowsSel.length < 2) rowsSel.push(j0 + 1 <= g.bandEnd ? j0 + 1 : j0 - 1);
        for (let step = 1; step < m; step++) {
          const i = (((i0 + di * step) % C) + C) % C;
          for (const j of rowsSel) if (field[i + C * j] <= 0) flip(i + C * j, true);
        }
      } else {
        const iSel = [i0, (i0 + 1) % C];
        for (let step = 1; step < m; step++) {
          const j = j0 + dj * step;
          for (const i of iSel) if (field[i + C * j] <= 0) flip(i + C * j, true);
        }
      }
      return true;
    }
  }

  return { geometry: g, field, report };
}


export const MAX_AUTO_RIBS = 48;

interface HoleRun { j: number; start: number; cols: number; mm: number; full: boolean }

/**
 * Analyses the generated wall pattern and picks the rib count it needs, as an even number of
 * evenly spaced ribs so the shade looks uniform.
 * A hole needs support when its cross-section is wider than p.maxBridge (too wide to bridge) and
 * its roof is shallower than ~45 degrees (too flat to self-support). Ribs are forced solid, so a
 * rib through such a hole cuts it into narrower ones. Counts 2, 4, 6 ... are tried in turn, each
 * at a few rotations, and the first that leaves no such hole wins. 0 ribs if none is needed.
 */
export function suggestRibs(img: GrayImage, p: TealightParams): RibSuggestion {
  const { geometry: g, field } = buildTealightField(img, { ...p, ribs: 0, ribAngles: undefined });
  const C = g.cols;
  const rowsN = g.zs.length;
  const TWO_PI = 2 * Math.PI;

  /** Every offending hole cross-section in the pattern given rib angles. */
  const findRuns = (angles: number[]): HoleRun[] => {
    const out: HoleRun[] = [];
    const ribCol = new Uint8Array(C);
    const roof = new Uint8Array(C);
    for (let j = g.openLo; j <= g.openHi; j++) {
      const R = coneRadius(g.Rb, g.k, g.zs[j]);
      const colMm = (TWO_PI * R) / C;
      ribCol.fill(0);
      const half = p.ribWidth / (2 * R);
      for (const a of angles) {
        const c0 = Math.ceil(((a - half) / TWO_PI) * C - 1e-9), c1 = Math.floor(((a + half) / TWO_PI) * C + 1e-9);
        for (let c = c0; c <= c1; c++) ribCol[((c % C) + C) % C] = 1;
      }
      const solidAt = (i: number, row: number) => row >= rowsN || field[i + C * row] > 0 || (row >= g.openLo && row <= g.openHi && ribCol[i] === 1);
      let any = 0;
      for (let i = 0; i < C; i++) { roof[i] = !solidAt(i, j) && solidAt(i, j + 1) ? 1 : 0; any |= roof[i]; }
      if (!any) continue;
      // A roof that steps out by at most ~45 degrees per layer prints without support.
      const dz = j + 1 < rowsN ? g.zs[j + 1] - g.zs[j] : colMm;
      const steepLimit = 1.5 * Math.max(dz, colMm);
      let start = 0;
      while (start < C && !solidAt(start, j)) start++;
      const full = start === C;
      if (full) start = 0;
      let width = 0, runStart = start, roofRun = 0, roofMax = 0;
      const close = () => {
        if (width * colMm > p.maxBridge && roofMax * colMm > steepLimit) out.push({ j, start: runStart, cols: width, mm: full ? Infinity : width * colMm, full });
        width = 0; roofRun = 0; roofMax = 0;
      };
      for (let k = 0; k < C; k++) {
        const i = (start + k) % C;
        if (solidAt(i, j)) { if (width) close(); continue; }
        if (width === 0) runStart = i;
        width++;
        roofRun = roof[i] ? roofRun + 1 : 0;
        roofMax = Math.max(roofMax, roofRun);
      }
      if (width) close();
    }
    return out;
  };
  const widest = (runs: HoleRun[]) => runs.reduce((m, r) => Math.max(m, r.mm), 0);

  const base = findRuns([]);
  const spanWithoutRibs = widest(base);
  const problemRows = new Set(base.map((r) => r.j)).size;

  // Ribs stay uniform: an even count, evenly spaced. Try each count with a few rotations (the
  // ring may line up better with the pattern when turned) and keep the first that clears every hole.
  const evenly = (n: number, phase: number) => Array.from({ length: n }, (_, k) => phase + (k / n) * TWO_PI);
  const OFFSETS = 8;
  if (base.length === 0) return { ribs: 0, angles: [], worstSpan: 0, spanWithoutRibs, problemRows, achievable: true };
  let best = { angles: evenly(MAX_AUTO_RIBS, 0), span: Infinity };
  for (let n = 2; n <= MAX_AUTO_RIBS; n += 2) {
    for (let o = 0; o < OFFSETS; o++) {
      const angles = evenly(n, (o / OFFSETS) * (TWO_PI / n));
      const span = widest(findRuns(angles));
      if (span === 0) return { ribs: n, angles, worstSpan: 0, spanWithoutRibs, problemRows, achievable: true };
      if (n === MAX_AUTO_RIBS && span < best.span) best = { angles, span };
    }
  }
  return { ribs: best.angles.length, angles: best.angles, worstSpan: best.span, spanWithoutRibs, problemRows, achievable: false };
}

// ---- meshing ---------------------------------------------------------------------------------

export interface TealightResult {
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  geometry: TealightGeometry;
  field: Float32Array;
  report: FieldReport & {
    effectiveShadowRadius: number;
    check: MeshCheck;
    warnings: string[];
    ms: number;
  };
}

export function generateTealightShade(img: GrayImage, p: TealightParams, runChecks = true): TealightResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const errors = validateTealightParams(p);
  if (errors.length) throw new Error(errors.join(' '));

  const { geometry: g, field, report } = buildTealightField(img, p);
  const C = g.cols;
  const mb = new MeshBuilder();

  const innerMap = (th: number, z: number): [number, number, number] => {
    const r0 = coneRadius(g.Rb, g.k, z);
    const r = r0 - ribBump(g, p, th, z, r0);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  const outerMap = (th: number, z: number): [number, number, number] => {
    const zo = outerHeight(g, z);
    const r = coneRadius(g.Rb, g.k, zo) + g.wall;
    return [r * Math.cos(th), r * Math.sin(th), zo];
  };

  const { topInner, topOuter, bottomInner, bottomOuter } = buildShell(mb, { cols: C, zs: g.zs, field, inner: innerMap, outer: outerMap }, {
    skipTopBorder: p.useLed,
    skipBottomBorder: p.closeBottom,
  });
  if (p.closeBottom) addFloor(mb, C, bottomInner, bottomOuter, p.floorThickness);

  if (p.useLed) addLedSocket(mb, g, p, topInner, topOuter);

  if (p.closeBottom) for (let v = 2; v < mb.positions.length; v += 3) mb.positions[v] += p.floorThickness; // rest the floor on z = 0
  const { positions, indices } = mb.toArrays();
  const check = runChecks
    ? checkMesh(positions, indices)
    : { triangleCount: indices.length / 3, watertight: true, badEdges: 0, degenerateTriangles: 0, signedVolume: 0, errors: [] };

  const warnings: string[] = [];
  if (report.islandsRemaining > 0)
    warnings.push(`${report.islandsRemaining} solid island(s) are not attached to the shade and would fall out.`);
  else if (report.islandsFound > 0 && p.autoBridge)
    warnings.push(`${report.islandsFound} floating solid island(s) were bridged with thin strips.`);
  else if (report.islandsFound > 0)
    warnings.push(`${report.islandsFound} solid island(s) are not attached; enable auto-bridge or add ribs.`);
  if (p.minFeature > 0 && report.specksRemoved > 0)
    warnings.push(`${report.specksRemoved} feature(s) smaller than ${p.minFeature} mm were dropped.`);
  if (g.zmax < p.shadowRadius && tableRadiusAt(g, g.zmax) < p.shadowRadius - 0.5)
    warnings.push('Light height limits the pattern: the outer part of the image is cropped.');

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    positions,
    indices,
    triangleCount: indices.length / 3,
    geometry: g,
    field,
    report: {
      ...report,
      effectiveShadowRadius: tableRadiusAt(g, g.zmax),
      check,
      warnings,
      ms: t1 - t0,
    },
  };
}

/**
 * Solid floor plate below the shade: a disc closing the inner bottom ring (top face) plus the
 * plate's side wall and underside. The shell's own bottom ring edge is shared with the plate side,
 * so the whole thing stays one closed manifold. The plate occupies z in [-thickness, 0].
 */
function addFloor(mb: MeshBuilder, C: number, bottomInner: Int32Array, bottomOuter: Int32Array, thickness: number) {
  const pos = mb.positions;
  const at = (v: number): [number, number] => [pos[3 * v], pos[3 * v + 1]];
  const centerTop = mb.vertex(0, 0, 0);
  const centerBottom = mb.vertex(0, 0, -thickness);
  const rim = new Int32Array(C);
  for (let i = 0; i < C; i++) {
    const [x, y] = at(bottomOuter[i]);
    rim[i] = mb.vertex(x, y, -thickness);
  }
  for (let i = 0; i < C; i++) {
    const i1 = (i + 1) % C;
    mb.tri(centerTop, bottomInner[i], bottomInner[i1]);               // floor, facing up
    mb.quad(bottomOuter[i], rim[i], rim[i1], bottomOuter[i1]);        // plate side, facing out
    mb.tri(centerBottom, rim[i1], rim[i]);                            // underside, facing down
  }
}

/**
 * Unwrapped wall map as SVG (mm): x = arc length around the shade at mid height, y = height
 * (top of the shade at the top). Solid wall is black, holes are white. Cells are merged into
 * horizontal runs per row, so the file stays small.
 */
export function generateTealightMapSvg(res: Pick<TealightResult, 'field' | 'geometry'>, p: TealightParams): string {
  const { geometry: g, field } = res;
  const C = g.cols, zs = g.zs;
  const rMid = g.Rb + (g.k * g.H) / 2;
  const W = 2 * Math.PI * rMid, Hh = g.H;
  const cw = W / C;
  const f = (n: number) => +n.toFixed(3);
  // Contour the same node field the 3D mesh is cut from (marching squares, linear interpolation), so the
  // drawn edge is the printed edge, smooth rather than following cell steps. Rows run top to bottom
  // (y grows downwards); column C repeats column 0 so the map is a flat sheet cut at the seam.
  const rowsN = zs.length;
  const values = new Float32Array((C + 1) * rowsN);
  for (let r = 0; r < rowsN; r++) {
    const j = rowsN - 1 - r;
    for (let i = 0; i <= C; i++) values[i + (C + 1) * r] = field[(i % C) + C * j];
  }
  const xs = Array.from({ length: C + 1 }, (_, i) => i * cw);
  const ys = Array.from({ length: rowsN }, (_, r) => Hh - zs[rowsN - 1 - r]);
  // One closed path per hole (outline plus any islands). Curves are thinned to 0.05 mm and drawn as cubic
  // splines with sharp turns kept as corners, so CAD imports a handful of entities per shape.
  const paths = contourShapes(values, C + 1, rowsN, xs, ys).map((s) => `<path d="${smoothPath([s.outer, ...s.holes], 0.05)}"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(Hh)}mm" viewBox="0 0 ${f(W)} ${f(Hh)}">
<title>Tealight shade unwrapped map (${p.innerDiameter} mm base, ${p.height} mm high)</title>
<rect width="${f(W)}" height="${f(Hh)}" fill="#000"/>
<g fill="#fff" fill-rule="evenodd">
${paths.join('\n')}
</g>
</svg>
`;
}

/** Flange + upright tube on the top rim that carries the inverted LED tealight body. */
function addLedSocket(mb: MeshBuilder, g: TealightGeometry, p: TealightParams, topInner: Int32Array, topOuter: Int32Array) {
  const C = g.cols;
  const a = (p.tealightDiameter + LED_CLEARANCE) / 2;
  const tube = g.wall;
  const b = a + tube;
  const lipR = a - LIP_WIDTH;
  const H = g.H;
  const rA = coneRadius(g.Rb, g.k, H);
  const rB = rA + g.wall;
  const pOut = Math.max(rB, b);
  const seat = H + g.lipT;
  const chamfer = Math.max(0, rA - lipR); // 45 degrees: rises one mm per mm of inward reach

  type Pt = { r: number; z: number; ring?: Int32Array };
  const raw: Pt[] = [
    { r: lipR, z: H + chamfer },
    { r: rA, z: H, ring: topInner },
    { r: rB, z: H, ring: topOuter },
    { r: pOut, z: H },
    { r: pOut, z: seat },
    { r: b, z: seat },
    { r: b, z: seat + p.bodyHeight },
    { r: a, z: seat + p.bodyHeight },
    { r: a, z: seat },
    { r: lipR, z: seat },
  ];
  const pts: Pt[] = [];
  for (const q of raw) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.r - q.r) < 1e-9 && Math.abs(last.z - q.z) < 1e-9) {
      if (q.ring && !last.ring) last.ring = q.ring;
      continue;
    }
    pts.push(q);
  }
  while (pts.length > 1 && Math.abs(pts[0].r - pts[pts.length - 1].r) < 1e-9 && Math.abs(pts[0].z - pts[pts.length - 1].z) < 1e-9) pts.pop();

  for (const q of pts) {
    if (q.ring) continue;
    q.ring = new Int32Array(C);
    for (let i = 0; i < C; i++) {
      const th = (2 * Math.PI * i) / C;
      q.ring[i] = mb.vertex(q.r * Math.cos(th), q.r * Math.sin(th), q.z);
    }
  }
  for (let m = 0; m < pts.length; m++) {
    const P = pts[m], Q = pts[(m + 1) % pts.length];
    if (P.ring === topInner && Q.ring === topOuter) continue; // glued to the shade's rim
    for (let i = 0; i < C; i++) {
      const i1 = (i + 1) % C;
      mb.quad(P.ring![i], P.ring![i1], Q.ring![i1], Q.ring![i]);
    }
  }
}

// ---- forward projection (pure geometry) ---------------------------------------------------

/** Interpolated field value at (theta, z) on the wall. */
function fieldAt(res: Pick<TealightResult, 'field' | 'geometry'>, theta: number, z: number): number {
  const { geometry: g, field } = res;
  const C = g.cols, zs = g.zs;
  let lo = 0, hi = zs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (zs[mid] <= z) lo = mid; else hi = mid; }
  const tz = (z - zs[lo]) / (zs[hi] - zs[lo]);
  const u = ((theta / (2 * Math.PI)) % 1 + 1) % 1 * C;
  const i0 = Math.floor(u) % C, i1 = (i0 + 1) % C, tx = u - Math.floor(u);
  const a = field[i0 + C * lo] * (1 - tx) + field[i1 + C * lo] * tx;
  const b = field[i0 + C * hi] * (1 - tx) + field[i1 + C * hi] * tx;
  return a * (1 - tz) + b * tz;
}


/** Forward-projects the generated wall field onto an N x N table raster and compares with the input. */
export function compareShadow(img: GrayImage, p: TealightParams, res: Pick<TealightResult, 'field' | 'geometry'>, size = 256): ShadowComparison {
  const g = res.geometry;
  const Rs = p.shadowRadius;
  const rMin = tableRadiusAt(g, g.baseBand) + 0.5;
  const rMax = Math.min(Rs, tableRadiusAt(g, g.zmax)) - 0.5;
  const projected = new Uint8Array(size * size);
  const target = new Uint8Array(size * size);
  const valid = new Uint8Array(size * size);
  const ribHalf = p.ribs > 0 ? p.ribWidth / (2 * (g.Rb + Math.min(0, g.k) * g.H)) + 0.02 : 0;
  let inter = 0, uni = 0;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = ((px + 0.5) / size - 0.5) * 2 * Rs;
      const y = (0.5 - (py + 0.5) / size) * 2 * Rs;
      const r = Math.hypot(x, y);
      const idx = px + size * py;
      const lumT = luminanceAt(img, Rs * (p.imageScale / 100), x - p.imageOffsetX, y - p.imageOffsetY, p.invert);
      target[idx] = lumT * 255 - p.threshold <= 0 ? 1 : 0;
      if (r < rMin || r > rMax) continue;
      const th = Math.atan2(y, x);
      const z = wallHeightForTableRadius(g, r);
      projected[idx] = fieldAt(res, th, z) <= 0 ? 1 : 0;
      let skip = false;
      if (ribHalf > 0) {
        for (const a of ribAngleList(p)) if (Math.abs(angDiff(th, a)) <= ribHalf) { skip = true; break; }
      }
      if (skip) continue;
      valid[idx] = 1;
      if (projected[idx] && target[idx]) inter++;
      if (projected[idx] || target[idx]) uni++;
    }
  }
  return { size, projected, target, valid, iou: uni === 0 ? 1 : inter / uni };
}
