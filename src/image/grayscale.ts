import { GrayImage, ImageAdjustments } from '../types';

/**
 * Converts RGBA pixel buffer to normalized grayscale [0..1] with image adjustments.
 * Formula: Y = 0.299*R + 0.587*G + 0.114*B
 */
export function rgbaToGrayscale(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  adjustments?: Partial<ImageAdjustments>
): GrayImage {
  const pixelCount = width * height;
  const pixels = new Float32Array(pixelCount);

  const invert = adjustments?.invert ?? false;
  const brightness = adjustments?.brightness ?? 0;
  const contrast = adjustments?.contrast ?? 1;
  const gamma = adjustments?.gamma ?? 1;
  const invGamma = gamma !== 0 ? 1 / gamma : 1;

  for (let i = 0; i < pixelCount; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3] / 255;

    // Perceptual luminance with alpha blending onto white background (transparent = light opening)
    const effR = r * a + 255 * (1 - a);
    const effG = g * a + 255 * (1 - a);
    const effB = b * a + 255 * (1 - a);

    let lum = (0.299 * effR + 0.587 * effG + 0.114 * effB) / 255;

    // Invert if requested
    if (invert) {
      lum = 1 - lum;
    }

    // Brightness adjustment: shift [-1..1]
    lum = lum + brightness;

    // Contrast adjustment: centered at 0.5
    lum = (lum - 0.5) * contrast + 0.5;

    // Gamma correction
    lum = Math.max(0, Math.min(1, lum));
    if (gamma !== 1) {
      lum = Math.pow(lum, invGamma);
    }

    pixels[i] = Math.max(0, Math.min(1, lum));
  }

  return {
    width,
    height,
    pixels,
  };
}

/**
 * Creates an empty GrayImage filled with a constant value.
 */
export function createGrayImage(width: number, height: number, fill = 0): GrayImage {
  const pixels = new Float32Array(width * height);
  if (fill !== 0) {
    pixels.fill(fill);
  }
  return { width, height, pixels };
}
