import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runBoxRequest } from '../boxCompute';
import { DEFAULT_BOX_PARAMS } from '../../geometry/box/rimProfile';
import type { PartLoader } from '../../geometry/box/kit';
import type { GrayImage } from '../../types';

const load: PartLoader = async (file) => {
  const b = readFileSync(new URL(`../../../assets/box-kit/${file}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const disc: GrayImage = (() => {
  const n = 120, pixels = new Float32Array(n * n).fill(1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - 60, y - 60) < 35) pixels[y * n + x] = 0;
  return { width: n, height: n, pixels };
})();

describe('box request', () => {
  it('returns the ten kit parts, a zip, the preview and the light for default parameters', async () => {
    const out = await runBoxRequest({ shadow: disc, panel: disc, params: DEFAULT_BOX_PARAMS }, load);
    expect(out.parts).toHaveLength(10);
    expect(out.parts.every((p) => p.stl.byteLength > 84)).toBe(true);
    expect(out.zip.byteLength).toBeGreaterThan(out.parts.reduce((n, p) => n + p.stl.byteLength, 0));
    expect(out.preview.positions.length).toBeGreaterThan(0);
    expect(out.light.z).toBeGreaterThan(20);
    expect(out.ms).toBeGreaterThanOrEqual(0);
  });
});
