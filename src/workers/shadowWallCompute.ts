import type { GrayImage } from '../types';
import { ShadowWallParams, generateShadowWall, previewHeights } from '../geometry/shadowWall/shadowWall';
import { indexedMeshToBinarySTL } from '../geometry/stl';
import type { MeshCheck } from '../geometry/meshCheck';

export interface ShadowWallRequest { image: GrayImage; params: ShadowWallParams }

export interface ShadowWallOutput {
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  /** Index count of the model proper; support pillars follow (preview colours them apart). */
  supportIndexStart: number;
  stl: ArrayBuffer;
  check: MeshCheck;
  warnings: string[];
  ms: number;
  /** Light height (z-up) and wall height, used by the preview scene. */
  lightZ: number;
  topZ: number;
  groundRadius: number;
}

/** Pure compute shared by the worker and the main-thread fallback. */
export function runShadowWallRequest(req: ShadowWallRequest): ShadowWallOutput {
  const { params } = req;
  const res = generateShadowWall(req.image, params, true);
  return {
    positions: res.positions,
    indices: res.indices,
    triangleCount: res.triangleCount,
    supportIndexStart: res.supportIndexStart,
    stl: indexedMeshToBinarySTL(res.positions, res.indices, 'Shadow Wall'),
    check: res.report.check,
    warnings: res.report.warnings,
    ms: res.report.ms,
    ...previewHeights(params),
    groundRadius: (params.shadowSize * params.imageScale) / 200,
  };
}
