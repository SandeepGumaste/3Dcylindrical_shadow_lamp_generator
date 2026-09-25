import { Vec3 } from '../geometry/vectors';

export interface GrayImage {
  width: number;
  height: number;
  pixels: Float32Array; // 0 = black, 1 = white
}

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

export interface LampConfig {
  diameter: number;       // mm, e.g. 90
  height: number;         // mm, e.g. 100
  wallThickness: number;  // mm, e.g. 1.2
  minFeatureSize: number; // mm, e.g. 0.8
  holeSize: number;       // mm, relative opening size (0.2 to 1.0)
  segmentsAround: number; // e.g. 240 - 360
  segmentsVertical: number;// e.g. 120 - 200
  topRimHeight: number;   // mm, e.g. 4
  bottomRimHeight: number;// mm, e.g. 6
  hasBase: boolean;       // include solid base with cavity
  baseHeight: number;     // mm, e.g. 8
  ledCavityDiameter: number; // mm, e.g. 38 (fits standard tea light)
  ledCavityDepth: number;    // mm, e.g. 6
  wireSlotWidth: number;     // mm, e.g. 3.5
}

export type ProjectionTarget = 'tabletop' | 'vertical_wall';

export interface LightConfig {
  position: Vec3;         // mm relative to lamp center (0, y, 0)
  ledDiameter: number;    // mm, e.g. 5
  target: ProjectionTarget; // 'tabletop' (360° radial shadow on table around base) | 'vertical_wall'
  tableRadius: number;    // mm radius of shadow on tabletop (default 220mm)
  projectionDistance: number; // mm distance to virtual shadow screen, e.g. 250mm
  projectionWidth: number;    // mm width of target screen, e.g. 300mm
  projectionHeight: number;   // mm height of target screen, e.g. 300mm
  radialStruts: number;       // number of structural radial shadow ribs (e.g. 32 or 40, matching the photo)
  strutThicknessRatio: number;// width of radial ribs (0.05 to 0.3)
  strutWidthColumns?: number; // width in discrete columns (1, 2, or 3)
}

export interface HalftoneOptions {
  mode: 'halftone' | 'binary';
  threshold: number;      // 0 to 1, default 0.5
  bayerSize?: 4 | 8;
  preserveBridges?: boolean; // Ensure 3D print connectivity
  radialStruts?: number;     // Number of vertical struts casting radial shadow ribs (e.g. 32)
  strutWidthColumns?: number;// Width of struts in grid columns (default 1)
}


export interface ShadowAccumulator {
  width: number;
  height: number;
  sum: Float32Array;
  weight: Float32Array;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
  isWatertight: boolean;
  validationErrors: string[];
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  lamp: Partial<LampConfig>;
  light: Partial<LightConfig>;
  resolution: number;
}
