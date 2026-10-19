import { describe, it, expect } from 'vitest';
import { generatePanel } from '../panelMesh';
import { DEFAULT_BOX_PARAMS, type BoxParams } from '../rimProfile';
import { checkMesh } from '../../meshCheck';
import type { GrayImage } from '../../../types';

const P = (o: Partial<BoxParams> = {}): BoxParams => ({ ...DEFAULT_BOX_PARAMS, ...o });
const img = (w: number, h: number, f: (x: number, y: number) => number): GrayImage => {
  const pixels = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixels[y * w + x] = f(x, y);
  return { width: w, height: h, pixels };
};
const bbox = (p: Float32Array) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
  return { mn, mx };
};
const maxXAtTop = (p: Float32Array, z: number) => { let m = -Infinity; for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 2] - z) < 1e-4) m = Math.max(m, p[i]); return m; };
const minXAtTop = (p: Float32Array, z: number) => { let m = Infinity; for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 2] - z) < 1e-4) m = Math.min(m, p[i]); return m; };

describe('picture panel', () => {
  const half = img(100, 130, (x) => (x < 50 ? 0 : 1));

  it('is a closed mesh 113.9 x 143.9 mm and 4.0 mm tall for a mixed picture', () => {
    const { mesh } = generatePanel(half, P());
    const c = checkMesh(mesh.positions, mesh.indices);
    expect(c.errors).toEqual([]);
    expect(c.watertight).toBe(true);
    expect(c.signedVolume).toBeGreaterThan(0);
    const { mn, mx } = bbox(mesh.positions);
    expect(mx[0] - mn[0]).toBeCloseTo(113.9, 1);
    expect(mx[1] - mn[1]).toBeCloseTo(143.9, 1);
    expect(mx[2] - mn[2]).toBeCloseTo(4, 3);
  });

  it('stays at 3.5 mm for a flat white picture and reaches 4.0 mm for a flat black one', () => {
    expect(bbox(generatePanel(img(50, 50, () => 1), P()).mesh.positions).mx[2]).toBeCloseTo(3.5, 3);
    expect(bbox(generatePanel(img(50, 50, () => 0), P()).mesh.positions).mx[2]).toBeCloseTo(4, 3);
  });

  it('raises the dark side of the picture, and panelInvert swaps it', () => {
    const normal = generatePanel(half, P()).mesh.positions;
    expect(maxXAtTop(normal, 4)).toBeLessThan(113.9 / 2 + 1);
    const swapped = generatePanel(half, P({ panelInvert: true })).mesh.positions;
    expect(minXAtTop(swapped, 4)).toBeGreaterThan(113.9 / 2 - 1);
  });

  it('stays a closed mesh within 500,000 triangles for a huge noisy picture (every corner checkerboard)', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const noise = img(1200, 1500, () => (rnd() < 0.5 ? 0 : 1));
    const res = generatePanel(noise, P());
    expect(res.triangleCount).toBeLessThanOrEqual(500000);
    const c = checkMesh(res.mesh.positions, res.mesh.indices);
    expect(c.errors).toEqual([]);
    expect(c.watertight).toBe(true);
  });

  it('keeps a one-pixel checkerboard watertight', () => {
    const board = img(64, 80, (x, y) => (x + y) % 2);
    const c = checkMesh(...(() => { const m = generatePanel(board, P()).mesh; return [m.positions, m.indices] as const; })());
    expect(c.watertight).toBe(true);
  });
});
