import type { GrayImage } from '../types';
import { TealightParams } from '../geometry/tealightShade';

/**
 * Built-in tealight patterns. Procedural (no canvas / SVG decode) so they are deterministic and
 * usable from tests and workers. Convention: black = light passes, white = solid. Coordinates
 * are normalised so the shadow disk is the unit disk; the centre (r < ~0.25) is hidden under
 * the shade, so designs keep their detail further out.
 */
export interface TealightSample {
  id: string;
  name: string;
  make: (size?: number) => GrayImage;
  params: Partial<TealightParams>;
}

function raster(size: number, black: (x: number, y: number) => boolean): GrayImage {
  const pixels = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = ((px + 0.5) / size - 0.5) * 2;
      const y = -((py + 0.5) / size - 0.5) * 2;
      pixels[py * size + px] = black(x, y) ? 0 : 1;
    }
  }
  return { width: size, height: size, pixels };
}

const dots = (x: number, y: number) => {
  const r = Math.hypot(x, y);
  const a = Math.atan2(y, x);
  if (r < 0.3 || r > 0.9) return false;
  const ring = r < 0.55 ? 0.42 : 0.74;
  const n = r < 0.55 ? 10 : 18;
  const cell = (2 * Math.PI) / n;
  const da = ((((a % cell) + cell) % cell) - cell / 2) * ring;
  return Math.hypot(r - ring, da) < 0.07;
};

export const TEALIGHT_SAMPLES: TealightSample[] = [
  { id: 'dots', name: 'Dots', make: (n = 512) => raster(n, dots), params: { threshold: 128, edgeRounding: 10, invert: false } },
];

/** Asymmetric test pattern (an "L" plus a dot in the upper-right) for mirroring checks. */
export function asymmetricTestImage(size = 512): GrayImage {
  return raster(size, (x, y) => {
    const inL = (x > 0.35 && x < 0.5 && y > 0.3 && y < 0.85) || (x > 0.35 && x < 0.8 && y > 0.3 && y < 0.45);
    const dot = Math.hypot(x + 0.5, y - 0.55) < 0.1;
    const bar = x > -0.8 && x < -0.3 && y < -0.5 && y > -0.62;
    return inL || dot || bar;
  });
}
