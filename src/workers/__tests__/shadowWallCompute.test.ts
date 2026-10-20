import { describe, it, expect } from 'vitest';
import { runShadowWallRequest } from '../shadowWallCompute';
import { DEFAULT_SHADOW_WALL_PARAMS } from '../../geometry/shadowWall/shadowWall';
import type { GrayImage } from '../../types';

const disc: GrayImage = (() => {
  const n = 120, pixels = new Float32Array(n * n).fill(1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - 60, y - 60) < 35) pixels[y * n + x] = 0;
  return { width: n, height: n, pixels };
})();

describe('shadow wall request', () => {
  const out = runShadowWallRequest({ image: disc, params: DEFAULT_SHADOW_WALL_PARAMS });
  it('returns a watertight mesh and a binary STL sized for its triangles', () => {
    expect(out.check.watertight).toBe(true);
    expect(out.triangleCount).toBeGreaterThan(0);
    expect(out.stl.byteLength).toBe(84 + 50 * out.triangleCount);
  });
  it('reports the light height, top and ground radius for the preview', () => {
    const p = DEFAULT_SHADOW_WALL_PARAMS;
    expect(out.lightZ).toBe(p.lightHeight + p.baseThickness);
    expect(out.topZ).toBe(p.height + p.baseThickness);
    expect(out.groundRadius).toBe((p.shadowSize * p.imageScale) / 200);
    expect(out.ms).toBeGreaterThanOrEqual(0);
  });
  it('leaves lightZ and topZ unshifted without a base', () => {
    const p = { ...DEFAULT_SHADOW_WALL_PARAMS, base: false };
    const o = runShadowWallRequest({ image: disc, params: p });
    expect(o.lightZ).toBe(p.lightHeight);
    expect(o.topZ).toBe(p.height);
    expect(o.check.watertight).toBe(true);
    expect(o.stl.byteLength).toBe(84 + 50 * o.triangleCount);
  });
});
