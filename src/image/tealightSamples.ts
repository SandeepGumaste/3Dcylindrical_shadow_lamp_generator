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

const mandala = (x: number, y: number) => {
  const r = Math.hypot(x, y);
  const a = Math.atan2(y, x);
  if (r < 0.26 || r > 0.96) return false;
  if (r < 0.36) return Math.cos(12 * a) > 0.2 && r > 0.29;           // ring of dots
  if (r < 0.72) return r < 0.42 + 0.3 * Math.abs(Math.cos(6 * a)) && r > 0.42; // six petals
  if (r > 0.8 && r < 0.92) return Math.cos(24 * a) > 0.1;             // outer slots
  return false;
};

const crest = (x: number, y: number) => {
  // shield outline: top edge flat, sides straight, bottom a point
  const hw = (yy: number) => (yy >= -0.1 ? 0.62 : 0.62 * Math.max(0, 1 - Math.pow((-0.1 - yy) / 0.8, 1.6)));
  const inside = (xx: number, yy: number, shrink: number) => yy < 0.62 - shrink && yy > -0.9 + shrink && Math.abs(xx) < hw(yy) - shrink;
  const outline = inside(x, y, 0) && !inside(x, y, 0.08);
  const cross = inside(x, y, 0.2) && ((Math.abs(x) < 0.07 && y > -0.55) || (Math.abs(y - 0.18) < 0.07 && Math.abs(x) < 0.4));
  const star = Math.hypot(x, y + 0.42) < 0.12;
  return outline || cross || star;
};

const catHead = (x: number, y: number) => {
  const head = Math.hypot(x / 0.62, (y + 0.1) / 0.55) < 1;
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
    const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const ears = tri(-0.58, 0.1, -0.2, 0.28, -0.52, 0.72) || tri(0.58, 0.1, 0.2, 0.28, 0.52, 0.72);
  const eyes = Math.hypot(x - 0.26, y - 0.0) < 0.1 || Math.hypot(x + 0.26, y - 0.0) < 0.1;
  const nose = tri(-0.08, -0.22, 0.08, -0.22, 0, -0.32);
  return (head || ears) && !eyes && !nose;
};

export const TEALIGHT_SAMPLES: TealightSample[] = [
  { id: 'mandala', name: 'Mandala', make: (n = 512) => raster(n, mandala), params: { threshold: 128, edgeRounding: 10, invert: false } },
  { id: 'crest', name: 'Crest', make: (n = 512) => raster(n, crest), params: { threshold: 128, edgeRounding: 10, invert: false } },
  { id: 'cat', name: 'Cat head', make: (n = 512) => raster(n, catHead), params: { threshold: 128, edgeRounding: 10, invert: false } },
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
