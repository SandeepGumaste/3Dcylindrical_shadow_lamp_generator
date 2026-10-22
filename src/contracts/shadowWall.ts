export type FootprintKind = 'rectangle' | 'ellipse';

export interface FootprintParams {
  kind: FootprintKind;
  width: number;          // mm, along x
  length: number;         // mm, along y
  cornerRadius: number;   // mm, rectangle only (clamped to half the shorter side)
  wallThickness: number;  // mm
  cellSize?: number;      // mm, target sample spacing (default 0.4, one nozzle width)
}

export interface ShadowWallParams extends FootprintParams {
  height: number;        // mm, total wall height
  lightHeight: number;   // mm, hf
  shadowSize: number;    // mm width of the image canvas on the table at 100 %
  imageScale: number;    // %
  rotation: number;      // degrees, counter-clockwise on the table
  offsetX: number; offsetY: number; // mm, shift the image on the table
  threshold: number;     // 0..255
  edgeRounding: number;  // 0..40, blur radius = value / 10 grid pixels
  invert: boolean;       // false: dark pixels are shadow (solid)
  minFeature: number;    // mm, 0 = off
  base: boolean;         // plate under the wall (z = 0 of the wall is the top of the plate)
  baseThickness: number; // mm
  baseHoleDiameter: number; // mm, centre hole for the light
  magnetHoles: boolean;
  magnetDiameter: number; // mm
  magnetDepth: number;    // mm, from the underside
  magnetOffset: number;   // mm, pockets at (0, +offset) and (0, -offset)
}

export const DEFAULT_SHADOW_WALL_PARAMS: ShadowWallParams = {
  kind: 'rectangle',
  width: 80,
  length: 80,
  cornerRadius: 10,
  wallThickness: 1.2,
  height: 70,
  lightHeight: 90,
  shadowSize: 400,
  imageScale: 100,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  threshold: 128,
  edgeRounding: 10,
  invert: false,
  minFeature: 0.8,
  base: true,
  baseThickness: 3,
  baseHoleDiameter: 12.5,
  magnetHoles: true,
  magnetDiameter: 8.1,
  magnetDepth: 2.1,
  magnetOffset: 12,
};

/** Allowed corner radius (rectangle only), as in validateShadowWallParams: twice the wall up to half the shorter side. */
export function cornerRadiusLimits(p: Pick<ShadowWallParams, 'width' | 'length' | 'wallThickness'>): { min: number; max: number } {
  const min = 2 * p.wallThickness;
  return { min, max: Math.max(min, Math.min(p.width, p.length) / 2) };
}
