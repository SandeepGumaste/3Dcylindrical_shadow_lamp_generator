import type { GrayImage } from '../types';

/** 512 x 512 checker-in-disc used to characterize every generator. */
export function syntheticImage(): GrayImage {
  const w = 512, h = 512, pixels = new Float32Array(w * h).fill(1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.hypot(x - 256, y - 256) < 150 && (Math.floor(x / 40) + Math.floor(y / 40)) % 2) pixels[y * w + x] = 0;
    }
  }
  return { width: w, height: h, pixels };
}
