import type { GrayImage } from '../contracts/outputs';
export type { GrayImage };

export interface ImageAdjustments {
  invert: boolean;
  brightness: number; // -1 to 1, default 0
  contrast: number;   // 0.1 to 3.0, default 1
  gamma: number;      // 0.2 to 3.0, default 1
  threshold: number;  // 0 to 1, default 0.5
  rotation: number;   // 0, 90, 180, 270
  flipHorizontal: boolean;
  mode: 'halftone' | 'binary';
}
