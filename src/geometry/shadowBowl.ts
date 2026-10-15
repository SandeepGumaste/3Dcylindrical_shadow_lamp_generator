/**
 * Shadow-art bowl: a hole-free bowl whose rim height varies with angle so the rim's shadow edge
 * traces a silhouette on the table. Pure functions (no DOM / three.js). z-up, table at z = 0.
 *
 * The light is a point on the axis at height ledHeight. A rim whose top outer edge sits at
 * radius Rout and height h casts its shadow edge at r = Rout * ledHeight / (ledHeight - h)
 * (the outer top edge is the one that grazes the ray, because the rim top is flat), so
 * h(theta) = ledHeight * (1 - Rout / rs(theta)).
 */
import type { GrayImage } from '../types';
import { MeshBuilder } from './shellMesh';
import { checkMesh, MeshCheck } from './meshCheck';
import { pixelToTable, tableToPixel } from './tealightShade';

export interface BowlParams {
  threshold: number;       // 0..255
  invert: boolean;
  shadowRadius: number;    // mm, image disk on the table
  bowlDiameter: number;    // mm, inner diameter of the bowl
  ledHeight: number;       // mm, light height above the table
  minRim: number;          // mm
  wallThickness: number;   // mm
  baseThickness: number;   // mm
  steps: number;           // angular resolution
  rimSmoothing: number;    // sigma in steps
  tealightDiameter: number;
  bodyHeight: number;
}

export const DEFAULT_BOWL_PARAMS: BowlParams = {
  threshold: 128,
  invert: false,
  shadowRadius: 150,
  bowlDiameter: 90,
  ledHeight: 30,
  minRim: 8,
  wallThickness: 2,
  baseThickness: 2,
  steps: 720,
  rimSmoothing: 3,
  tealightDiameter: 38,
  bodyHeight: 16,
};

const CLEARANCE = 0.4;

/** Rim height whose shadow edge lands at rs, clamped to [minRim, ledHeight - 1]. rs <= R gives minRim. */
export function rimHeight(ledHeight: number, R: number, rs: number, minRim: number): number {
  if (!(rs > R)) return minRim;
  const h = ledHeight * (1 - R / rs);
  return Math.min(Math.max(h, minRim), ledHeight - 1);
}

function sampleLum(img: GrayImage, px: number, py: number): number {
  const { width: w, height: h, pixels } = img;
  if (px < 0 || py < 0 || px > w || py > h) return 1;
  const x = Math.min(Math.max(px - 0.5, 0), w - 1);
  const y = Math.min(Math.max(py - 0.5, 0), h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const tx = x - x0, ty = y - y0;
  const a = pixels[y0 * w + x0] * (1 - tx) + pixels[y0 * w + x1] * tx;
  const b = pixels[y1 * w + x0] * (1 - tx) + pixels[y1 * w + x1] * tx;
  return a * (1 - ty) + b * ty;
}

/** Outermost dark (silhouette) radius per angular step in mm, 0 where the ray finds nothing. */
export function silhouetteRadii(img: GrayImage, p: BowlParams): Float32Array {
  const out = new Float32Array(p.steps);
  const S = Math.min(img.width, img.height);
  const dr = (2 * p.shadowRadius) / S / 2; // half a pixel on the table
  const n = Math.ceil(p.shadowRadius / dr);
  for (let i = 0; i < p.steps; i++) {
    const th = (2 * Math.PI * i) / p.steps;
    const c = Math.cos(th), s = Math.sin(th);
    for (let q = n; q >= 1; q--) {
      const r = q * dr;
      const [px, py] = tableToPixel(img, p.shadowRadius, r * c, r * s);
      let l = sampleLum(img, px, py);
      if (p.invert) l = 1 - l;
      if (l * 255 - p.threshold <= 0) { out[i] = r; break; }
    }
  }
  return out;
}

function circularGaussian(v: Float32Array, sigma: number): Float32Array {
  if (sigma < 0.05) return v;
  const N = v.length;
  const rad = Math.max(1, Math.ceil(3 * sigma));
  const ker: number[] = [];
  let sum = 0;
  for (let d = -rad; d <= rad; d++) { const w = Math.exp(-(d * d) / (2 * sigma * sigma)); ker.push(w); sum += w; }
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let a = 0;
    for (let d = -rad; d <= rad; d++) a += (ker[d + rad] / sum) * v[(((i + d) % N) + N) % N];
    out[i] = a;
  }
  return out;
}

export function validateBowlParams(p: BowlParams): string[] {
  const e: string[] = [];
  const R = p.bowlDiameter / 2;
  const a = (p.tealightDiameter + CLEARANCE) / 2;
  const b = a + Math.max(p.wallThickness, 1.6);
  const zTop = p.ledHeight - 1;
  if (b > R - 1.5) e.push('Bowl Diameter is too small for the tealight socket.');
  if (zTop - p.bodyHeight < p.baseThickness + 1) e.push('LED Height is too low for the tealight socket; raise it or reduce body height.');
  if (p.minRim >= p.ledHeight - 1) e.push('Minimum Rim must be below LED Height - 1 mm.');
  if (p.steps < 90) e.push('Resolution must be at least 90 steps.');
  if (p.shadowRadius <= R + p.wallThickness) e.push('Shadow Radius must exceed the bowl radius.');
  if (p.wallThickness <= 0 || p.baseThickness <= 0) e.push('Wall and base thickness must be positive.');
  return e;
}

export interface BowlResult {
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  rimHeights: Float32Array;
  silhouette: Float32Array;
  report: { check: MeshCheck; warnings: string[]; ms: number };
}

export function generateShadowBowl(img: GrayImage, p: BowlParams, runChecks = true): BowlResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const errs = validateBowlParams(p);
  if (errs.length) throw new Error(errs.join(' '));

  const N = p.steps;
  const Rin = p.bowlDiameter / 2;
  const Rout = Rin + p.wallThickness;
  const rs = silhouetteRadii(img, p);

  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) raw[i] = rimHeight(p.ledHeight, Rout, rs[i], p.minRim);
  const rim = circularGaussian(raw, p.rimSmoothing);
  const hi = p.ledHeight - 1;
  for (let i = 0; i < N; i++) rim[i] = Math.min(Math.max(rim[i], p.minRim), hi);

  // Socket pedestal: tube standing on the base, cup open at the top.
  const a = (p.tealightDiameter + CLEARANCE) / 2;
  const b = a + Math.max(p.wallThickness, 1.6);
  const zTop = p.ledHeight - 1;
  const zFloor = zTop - p.bodyHeight;
  const tb = p.baseThickness;

  type Ring = { poleIdx?: number; v: Int32Array | null };
  const mb = new MeshBuilder();
  const mk = (r: number, z: (i: number) => number): Ring => {
    if (r === 0) return { poleIdx: mb.vertex(0, 0, z(0)), v: null };
    const v = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const th = (2 * Math.PI * i) / N;
      v[i] = mb.vertex(r * Math.cos(th), r * Math.sin(th), z(i));
    }
    return { v };
  };
  const flat = (z: number) => () => z;

  // Closed profile, counter-clockwise in (rho, z).
  const rings: Ring[] = [
    mk(0, flat(0)),
    mk(Rout, flat(0)),
    mk(Rout, (i) => rim[i]),
    mk(Rin, (i) => rim[i]),
    mk(Rin, flat(tb)),
    mk(b, flat(tb)),
    mk(b, flat(zTop)),
    mk(a, flat(zTop)),
    mk(a, flat(zFloor)),
    mk(0, flat(zFloor)),
  ];
  for (let m = 0; m < rings.length; m++) {
    const P = rings[m], Q = rings[(m + 1) % rings.length];
    if (P.poleIdx !== undefined && Q.poleIdx !== undefined) continue; // axis segment
    for (let i = 0; i < N; i++) {
      const i1 = (i + 1) % N;
      if (P.poleIdx !== undefined) mb.tri(P.poleIdx, Q.v![i1], Q.v![i]);
      else if (Q.poleIdx !== undefined) mb.tri(P.v![i], P.v![i1], Q.poleIdx);
      else mb.quad(P.v![i], P.v![i1], Q.v![i1], Q.v![i]);
    }
  }

  const { positions, indices } = mb.toArrays();
  const check = runChecks
    ? checkMesh(positions, indices)
    : { triangleCount: indices.length / 3, watertight: true, badEdges: 0, degenerateTriangles: 0, signedVolume: 0, errors: [] };

  const warnings = ['Bowl mode reproduces star-shaped silhouettes only (one radius per angle); concave detail is lost.'];
  let clampedLow = 0;
  for (let i = 0; i < N; i++) if (raw[i] <= p.minRim + 1e-6) clampedLow++;
  if (clampedLow > N * 0.5) warnings.push('Most of the rim sits at the minimum height; the silhouette is mostly inside the bowl radius or empty.');

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { positions, indices, triangleCount: indices.length / 3, rimHeights: rim, silhouette: rs, report: { check, warnings, ms: t1 - t0 } };
}

export { pixelToTable };
