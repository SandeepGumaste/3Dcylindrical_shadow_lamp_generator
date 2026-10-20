import type { GrayImage } from '../types';
import { ShadowWallParams, generateShadowWall } from '../geometry/shadowWall/shadowWall';
import { indexedMeshToBinarySTL } from '../geometry/stl';
import type { MeshCheck } from '../geometry/meshCheck';

export interface ShadowWallRequest { image: GrayImage; params: ShadowWallParams }

export interface ShadowWallOutput {
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
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
    stl: indexedMeshToBinarySTL(res.positions, res.indices, 'Shadow Wall'),
    check: res.report.check,
    warnings: res.report.warnings,
    ms: res.report.ms,
    lightZ: params.lightHeight,
    topZ: params.height,
    groundRadius: (params.shadowSize * params.imageScale) / 200,
  };
}
