import { describe, it, expect } from 'vitest';
import { rgbaToGrayscale } from '../grayscale';
import { fitInSquare } from '../loadImage';

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
});

describe('fitInSquare', () => {
  it('fits a portrait image wholly inside the square, so nothing is cropped', () => {
    const { drawW, drawH } = fitInSquare(387, 516, 512);
    expect(drawH).toBeCloseTo(512, 6);
    expect(drawW).toBeCloseTo((512 * 387) / 516, 6);
    expect(drawW).toBeLessThan(512);
  });
  it('fits a landscape image wholly inside the square', () => {
    const { drawW, drawH } = fitInSquare(800, 400, 512);
    expect(drawW).toBeCloseTo(512, 6);
    expect(drawH).toBeCloseTo(256, 6);
  });
  it('leaves a square image as it is', () => {
    expect(fitInSquare(300, 300, 512)).toEqual({ drawW: 512, drawH: 512 });
  });
});
