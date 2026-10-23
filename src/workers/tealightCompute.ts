import type { GrayImage } from '../types';
import { TealightParams, generateTealightShade, generateTealightMapSvg, suggestRibs, RibSuggestion, compareShadow, ShadowComparison, FieldReport } from '../geometry/tealightShade';
import { BowlParams, generateShadowBowl } from '../geometry/shadowBowl';
import { indexedMeshToBinarySTL } from '../geometry/stl';
import { FlatStripParams } from '../geometry/flatStrip';
import { generateFlatStripExport } from '../geometry/flatStripExport';
import type { MeshCheck } from '../geometry/meshCheck';

export type TealightRequest =
  | { kind: 'tealight'; image: GrayImage; params: TealightParams }
  | { kind: 'bowl'; image: GrayImage; params: BowlParams }
  | { kind: 'flat'; image: GrayImage; params: TealightParams; flat: FlatStripParams };

export interface TealightOutput {
  kind: 'tealight' | 'bowl' | 'flat';
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
  /** Present when ribs were chosen automatically. */
  ribSuggestion?: RibSuggestion;
}

/** Pure compute shared by the worker and the main-thread fallback. */
export function runTealightRequest(req: TealightRequest): TealightOutput {
  if (req.kind === 'tealight') {
    const ribSuggestion = req.params.autoRibs ? suggestRibs(req.image, req.params) : undefined;
    const params = ribSuggestion ? { ...req.params, ribs: ribSuggestion.ribs, ribAngles: ribSuggestion.angles } : req.params;
    const res = generateTealightShade(req.image, params);
    const floor = params.closeBottom ? params.floorThickness : 0;
    const comparison = compareShadow(req.image, params, res, 256);
    if (ribSuggestion && !ribSuggestion.achievable)
      res.report.warnings.push(`Even ${ribSuggestion.ribs} ribs leave a ${ribSuggestion.worstSpan.toFixed(1)} mm wide hole with a flat roof; raise Max bridge span or simplify the image.`);
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
      topZ: floor + params.height + (params.useLed ? res.geometry.lipT + params.bodyHeight : 0),
      groundRadius: params.shadowRadius,
      mapSvg: generateTealightMapSvg(res, params),
      fieldReport: res.report,
      comparison,
      ribSuggestion,
    };
  }
  if (req.kind === 'flat') {
    const res = generateFlatStripExport(req.image, req.params, req.flat);
    return {
      kind: 'flat',
      positions: res.positions,
      indices: res.indices,
      triangleCount: res.triangleCount,
      stl: indexedMeshToBinarySTL(res.positions, res.indices, 'Tealight Flat Strip'),
      check: res.check,
      warnings: res.warnings,
      ms: res.ms,
      lightZ: 0,
      topZ: 0,
      groundRadius: req.params.shadowRadius,
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
