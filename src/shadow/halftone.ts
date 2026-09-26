import { LampConfig, HalftoneOptions } from '../types';

export const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export const BAYER_8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

export type { HalftoneOptions };

/**
 * Converts continuous cylindrical intensities [0..1] into a boolean mask
 * where true = OPEN hole (light passes), false = SOLID wall (light blocked).
 * Takes into account top and bottom solid rims for 3D print structural integrity.
 */
export function generateCylindricalMask(
  intensityGrid: Float32Array,
  gridWidth: number,
  gridHeight: number,
  lamp: LampConfig,
  options: HalftoneOptions = { mode: 'halftone', threshold: 0.5 }
): Uint8Array {
  const mask = new Uint8Array(gridWidth * gridHeight);
  const matrix = options.bayerSize === 8 ? BAYER_8 : BAYER_4;
  const mSize = matrix.length;
  const maxMVal = mSize * mSize;

  const topRimRows = Math.ceil((lamp.topRimHeight / lamp.height) * gridHeight);
  const bottomRimRows = Math.ceil((lamp.bottomRimHeight / lamp.height) * gridHeight);

  for (let row = 0; row < gridHeight; row++) {
    // Solid bottom ring and top ring for 3D printing
    if (row < bottomRimRows || row >= gridHeight - topRimRows) {
      for (let col = 0; col < gridWidth; col++) {
        mask[row * gridWidth + col] = 0; // Solid
      }
      continue;
    }

    for (let col = 0; col < gridWidth; col++) {
      const idx = row * gridWidth + col;
      const intensity = intensityGrid[idx];

      let isOpen = false;

      if (options.mode === 'binary') {
        // Direct thresholding
        isOpen = intensity > options.threshold;
      } else {
        // Bayer ordered dithering
        const bayerVal = (matrix[row % mSize][col % mSize] + 0.5) / maxMVal;
        // Contrast-curved threshold
        const adjustedThresh = Math.max(0.05, Math.min(0.95, options.threshold));
        const effectiveIntensity = Math.pow(intensity, 1.1);
        isOpen = effectiveIntensity > bayerVal * (adjustedThresh / 0.5);
      }

      // Radial structural struts (matching tabletop candle shadow lamps)
      // Vertical ribs run full height on the cylinder wall to connect floating islands
      if (options.radialStruts && options.radialStruts > 0) {
        const strutSpacing = Math.max(2, Math.floor(gridWidth / options.radialStruts));
        const rawWidth = Math.max(1, options.strutWidthColumns ?? 2);
        const strutWidth = Math.min(Math.max(1, strutSpacing - 1), rawWidth);
        if ((col % strutSpacing) < strutWidth) {
          isOpen = false;
        }
      }

      // Connectivity safeguard: never allow an infinite vertical column of 100% open holes without struts
      // Periodic bridge maintains structural column rib
      if (options.preserveBridges && (col % 40 === 0 && row % 8 === 0)) {
        isOpen = false;
      }

      mask[idx] = isOpen ? 1 : 0;
    }
  }

  return mask;
}

