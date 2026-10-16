import type { GrayImage } from '../types';
import { TealightParams, generateTealightShade, generateTealightMapSvg, compareShadow, ShadowComparison, FieldReport } from '../geometry/tealightShade';
import { BowlParams, generateShadowBowl } from '../geometry/shadowBowl';
import { indexedMeshToBinarySTL } from '../geometry/stl';
import type { MeshCheck } from '../geometry/meshCheck';

export type TealightRequest =
  | { kind: 'tealight'; image: GrayImage; params: TealightParams }
  | { kind: 'bowl'; image: GrayImage; params: BowlParams };

export interface TealightOutput {
  kind: 'tealight' | 'bowl';
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  stl: ArrayBuffer;
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
  comparison?: ShadowComparison;
}

/** Pure compute shared by the worker and the main-thread fallback. */
export function runTealightRequest(req: TealightRequest): TealightOutput {
  if (req.kind === 'tealight') {
    const res = generateTealightShade(req.image, req.params);
    const floor = req.params.closeBottom ? req.params.floorThickness : 0;
    const comparison = compareShadow(req.image, req.params, res, 256);
    return {
      kind: 'tealight',
      positions: res.positions,
      indices: res.indices,
      triangleCount: res.triangleCount,
      stl: indexedMeshToBinarySTL(res.positions, res.indices, 'Tealight Shade'),
      check: res.report.check,
      warnings: res.report.warnings,
      ms: res.report.ms,
      lightZ: res.geometry.hf + floor,
      topZ: floor + req.params.height + (req.params.useLed ? res.geometry.lipT + req.params.bodyHeight : 0),
      groundRadius: req.params.shadowRadius,
      mapSvg: generateTealightMapSvg(res, req.params),
      fieldReport: res.report,
      comparison,
    };
  }
  const res = generateShadowBowl(req.image, req.params);
  return {
    kind: 'bowl',
    positions: res.positions,
    indices: res.indices,
    triangleCount: res.triangleCount,
    stl: indexedMeshToBinarySTL(res.positions, res.indices, 'Shadow Bowl'),
    check: res.report.check,
    warnings: res.report.warnings,
    ms: res.report.ms,
    lightZ: req.params.ledHeight,
    topZ: req.params.ledHeight,
    groundRadius: req.params.shadowRadius,
  };
}
