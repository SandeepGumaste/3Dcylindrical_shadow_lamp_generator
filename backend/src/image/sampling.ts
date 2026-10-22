import { GrayImage } from '../types';

/**
 * Samples a GrayImage at normalized UV coordinates (0..1) with bilinear interpolation.
 */
export function sampleBilinear(image: GrayImage, u: number, v: number): number {
  const { width, height, pixels } = image;
  if (width === 0 || height === 0) return 0;

  // Clamp UV
  const cu = Math.max(0, Math.min(1, u));
  const cv = Math.max(0, Math.min(1, v));

  const x = cu * (width - 1);
  const y = cv * (height - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);

  const tx = x - x0;
  const ty = y - y0;

  const i00 = pixels[y0 * width + x0];
  const i10 = pixels[y0 * width + x1];
  const i01 = pixels[y1 * width + x0];
  const i11 = pixels[y1 * width + x1];

  const top = i00 * (1 - tx) + i10 * tx;
  const bot = i01 * (1 - tx) + i11 * tx;

  return top * (1 - ty) + bot * ty;
}

/**
 * Nearest-neighbor sample
 */
export function sampleNearest(image: GrayImage, u: number, v: number): number {
  const { width, height, pixels } = image;
  const cu = Math.max(0, Math.min(1, u));
  const cv = Math.max(0, Math.min(1, v));

  const x = Math.min(Math.floor(cu * width), width - 1);
  const y = Math.min(Math.floor(cv * height), height - 1);

  return pixels[y * width + x];
}
