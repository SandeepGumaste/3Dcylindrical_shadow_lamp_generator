import { describe, it, expect } from 'vitest';
import { sampleBilinear } from '../sampling';

describe('sampling', () => {
  it('performs bilinear sampling with clamping', () => {
    const pixels = new Float32Array([
      0, 1,
      1, 0,
    ]);
    const img = { width: 2, height: 2, pixels };

    // Center sample should interpolate to ~0.5
    const center = sampleBilinear(img, 0.5, 0.5);
    expect(center).toBeCloseTo(0.5, 1);

    // Corner samples
    expect(sampleBilinear(img, 0, 0)).toBe(0);
    expect(sampleBilinear(img, 1, 0)).toBe(1);
    expect(sampleBilinear(img, 0, 1)).toBe(1);
    expect(sampleBilinear(img, 1, 1)).toBe(0);
  });
});
