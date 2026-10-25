export interface GrayImage {
  width: number;
  height: number;
  pixels: Float32Array; // 0 = black, 1 = white
}

export interface MeshCheck {
  triangleCount: number;
  /** Every directed edge appears exactly once and has exactly one opposite twin. */
  watertight: boolean;
  /** Edges not shared by exactly two triangles, or with inconsistent winding. */
  badEdges: number;
  degenerateTriangles: number;
  /** Signed volume in mm^3; positive means outward-facing normals. */
  signedVolume: number;
  errors: string[];
}

export interface FieldReport {
  specksRemoved: number;
  islandsFound: number;
  islandsBridged: number;
  islandsRemaining: number;
}

export interface RibSuggestion {
  ribs: number;
  /** Rib centre angles (rad): evenly spaced, possibly rotated to suit the pattern. */
  angles: number[];
  /** Widest hole (mm) still too wide to bridge and too flat to self-support with these ribs; 0 = none. */
  worstSpan: number;
  /** The same measure on the pattern with no ribs. */
  spanWithoutRibs: number;
  /** Number of wide flat-roofed holes (rows merged) in the unribbed pattern, for reporting. */
  problemRows: number;
  /** False when MAX_AUTO_RIBS ribs cannot bring every hole under maxBridge. */
  achievable: boolean;
}

export interface ShadowComparison {
  size: number;
  /** 1 where the table is lit by the generated shade, image orientation (row 0 = top). */
  projected: Uint8Array;
  /** 1 where the thresholded input image is dark (wants light). */
  target: Uint8Array;
  /** 1 where the pixel is inside the comparable annulus (not foot, not ribs, within the disk). */
  valid: Uint8Array;
  iou: number;
}

/** ShadowComparison as sent over the wire: the three rasters are base64 of the raw bytes. */
export interface ShadowComparisonWire {
  size: number;
  projected: string;
  target: string;
  valid: string;
  iou: number;
}

/** What `fitShadowSize` returns. */
export interface FitResult { shadowSize: number; ok: boolean }

/** Metadata that accompanies a generated mesh (the mesh itself, STL, SVG and zip travel separately). */
export interface TealightMeta {
  kind: 'tealight' | 'bowl';
  triangleCount: number;
  check: MeshCheck;
  warnings: string[];
  ms: number;
  /** Light height (z-up) and overall height, used by the preview scene. */
  lightZ: number;
  topZ: number;
  groundRadius: number;
  /** Unwrapped wall map (tealight mode only). */
  mapSvg?: string;
  fieldReport?: FieldReport & { effectiveShadowRadius: number };
  comparison?: ShadowComparisonWire;
  ribSuggestion?: RibSuggestion;
}

export interface WallMeta {
  triangleCount: number;
  /** Index count of the model proper; support pillars follow (the preview colours them apart). */
  supportIndexStart: number;
  check: MeshCheck;
  warnings: string[];
  ms: number;
  lightZ: number;
  topZ: number;
  groundRadius: number;
  fit?: FitResult;
}

export interface BoxMeta {
  parts: { id: string; label: string; generated: boolean }[];
  light: { x: number; y: number; z: number };
  warnings: string[];
  clamped: boolean;
  ms: number;
  fit?: FitResult;
}

export interface LightMeta { triangleCount: number }
