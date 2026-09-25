import { describe, it, expect } from 'vitest';
import { rgbaToGrayscale } from '../grayscale';
import { sampleBilinear } from '../sampling';

describe('SVG and Grayscale Processing', () => {
  it('correctly blends transparent alpha to white background for vector silhouettes', () => {
    // 2x2 image:
    // Pixel 0: transparent (alpha = 0) -> should blend to 1.0 (white background / light opening)
    // Pixel 1: opaque black (alpha = 255, rgb = 0) -> should be 0.0 (shadow silhouette)
    // Pixel 2: opaque white (alpha = 255, rgb = 255) -> should be 1.0
    // Pixel 3: semi-transparent black (alpha = 128, rgb = 0) -> should be ~0.5
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 0,       // transparent
      0, 0, 0, 255,     // opaque black silhouette
      255, 255, 255, 255,// opaque white
      0, 0, 0, 128,     // 50% transparent black
    ]);

    const gray = rgbaToGrayscale(rgba, 2, 2);

    expect(gray.width).toBe(2);
    expect(gray.height).toBe(2);
    // Transparent becomes 1.0 (light can pass through)
    expect(gray.pixels[0]).toBeCloseTo(1.0, 2);
    // Opaque black becomes 0.0 (shadow blocker)
    expect(gray.pixels[1]).toBeCloseTo(0.0, 2);
    // Opaque white becomes 1.0
    expect(gray.pixels[2]).toBeCloseTo(1.0, 2);
    // 50% black on white becomes ~0.5
    expect(gray.pixels[3]).toBeGreaterThan(0.4);
    expect(gray.pixels[3]).toBeLessThan(0.6);
  });

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
