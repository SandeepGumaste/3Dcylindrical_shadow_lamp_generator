import type { GrayImage } from '../../types';
import { MeshBuilder } from '../shellMesh';
import { KIT } from './kitSpec';
import type { BoxParams } from './rimProfile';
import type { IndexedMesh } from './stlParse';

/** Top heights by level: 0 = underside, 1 = plain border, 2 = light picture, 3 = dark picture. */
const Z = [0, KIT.panel.plate, KIT.panel.lightTop, KIT.panel.darkTop];
const TRIANGLE_BUDGET = 480_000;

/**
 * The picture panel: a 3 mm plate with the picture raised to 3.5 mm (light) or 4.0 mm (dark)
 * inside a plain border, as a stepped heightfield on a grid sized to keep the worst case under
 * the triangle budget. Dark tones are the highest step, so they print as the black layers.
 */
export function generatePanel(img: GrayImage, p: BoxParams): { mesh: IndexedMesh; triangleCount: number; warnings: string[] } {
  const { w: W, h: H, border } = KIT.panel;
  // worst case is about six triangles per cell (two on top, up to four on the sides)
  const pitch = Math.max(0.35, Math.sqrt((W * H * 6) / TRIANGLE_BUDGET));
  const Nx = Math.round(W / pitch), Ny = Math.round(H / pitch);
  const cx = W / Nx, cy = H / Ny;
  const bx = Math.max(1, Math.round(border / cx)), by = Math.max(1, Math.round(border / cy));

  // level per cell
  const level = new Uint8Array(Nx * Ny).fill(1);
  const PW = (Nx - 2 * bx) * cx, PH = (Ny - 2 * by) * cy;
  const scale = Math.min(PW / img.width, PH / img.height); // mm per image pixel, picture fitted inside the border
  const t = p.panelThreshold / 255;
  const lumAt = (xMm: number, yMm: number) => {
    const ix = Math.floor(img.width / 2 + (xMm - W / 2) / scale), iy = Math.floor(img.height / 2 - (yMm - H / 2) / scale);
    return ix < 0 || iy < 0 || ix >= img.width || iy >= img.height ? null : img.pixels[iy * img.width + ix];
  };
  for (let j = by; j < Ny - by; j++) {
    for (let i = bx; i < Nx - bx; i++) {
      let dark = 0;
      for (const [a, b] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const lum = lumAt((i + a) * cx, (j + b) * cy);
        if (lum !== null && (p.panelInvert ? lum >= t : lum < t)) dark++;
      }
      level[j * Nx + i] = dark >= 2 ? 3 : 2;
    }
  }
  // A 2 x 2 block of alternating light and dark would share a vertical edge between four faces.
  // Raise the light cell of any such block: it can only add a dark cell, so this ends.
  for (let changed = true; changed;) {
    changed = false;
    for (let j = by; j < Ny - by - 1; j++) {
      for (let i = bx; i < Nx - bx - 1; i++) {
        const a = j * Nx + i, b = a + 1, c = a + Nx, d = c + 1;
        if (level[a] === level[d] && level[b] === level[c] && level[a] !== level[b]) {
          const light = level[a] === 2 ? [a, d] : [b, c];
          level[light[0]] = 3; changed = true;
        }
      }
    }
  }

  const mb = new MeshBuilder();
  const ids = new Map<number, number>();
  const v = (i: number, j: number, lv: number) => {
    const key = ((j * (Nx + 1) + i) << 2) | lv;
    let id = ids.get(key);
    if (id === undefined) { id = mb.vertex(i * cx, j * cy, Z[lv]); ids.set(key, id); }
    return id;
  };
  const at = (i: number, j: number) => level[j * Nx + i];

  for (let j = 0; j < Ny; j++) {
    for (let i = 0; i < Nx; i++) {
      const l = at(i, j);
      mb.quad(v(i, j, l), v(i + 1, j, l), v(i + 1, j + 1, l), v(i, j + 1, l)); // top, +z
      // wall towards the +x neighbour, or the outer side at the border
      const lo = i + 1 < Nx ? at(i + 1, j) : 0;
      stepWall(l, lo, (z) => v(i + 1, j, z), (z) => v(i + 1, j + 1, z));
      // wall towards the +y neighbour
      const up = j + 1 < Ny ? at(i, j + 1) : 0;
      stepWall(l, up, (z) => v(i + 1, j + 1, z), (z) => v(i, j + 1, z));
      // outer side at the -x and -y borders (the +x / +y ones are handled above)
      if (i === 0) stepWall(l, 0, (z) => v(0, j + 1, z), (z) => v(0, j, z));
      if (j === 0) stepWall(l, 0, (z) => v(i, 0, z), (z) => v(i + 1, 0, z));
    }
  }
  // One face per 0.5 mm step between neighbouring cells (and down to the underside at the border).
  function stepWall(a: number, b: number, p0: (z: number) => number, p1: (z: number) => number) {
    if (a === b) return;
    const hi = Math.max(a, b), lo = Math.min(a, b);
    for (let lv = lo; lv < hi; lv++) {
      // p0 -> p1 runs counter-clockwise around the cell `a` seen from above; the face looks outward from `a`
      if (a > b) mb.quad(p0(lv), p1(lv), p1(lv + 1), p0(lv + 1));
      else mb.quad(p1(lv), p0(lv), p0(lv + 1), p1(lv + 1));
    }
  }

  // Underside: a fan from the centre over the perimeter, so no triangle is degenerate.
  const centre = mb.vertex(W / 2, H / 2, 0);
  const ring: number[] = [];
  for (let i = 0; i < Nx; i++) ring.push(v(i, 0, 0));
  for (let j = 0; j < Ny; j++) ring.push(v(Nx, j, 0));
  for (let i = Nx; i > 0; i--) ring.push(v(i, Ny, 0));
  for (let j = Ny; j > 0; j--) ring.push(v(0, j, 0));
  for (let k = 0; k < ring.length; k++) mb.tri(centre, ring[(k + 1) % ring.length], ring[k]);

  const mesh = mb.toArrays();
  return { mesh, triangleCount: mesh.indices.length / 3, warnings: [] };
}
