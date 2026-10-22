import type { ShadowComparison, ShadowComparisonWire, TealightMeta, MeshCheck, FieldReport, RibSuggestion } from '../contracts/outputs';

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function decodeComparison(w: ShadowComparisonWire): ShadowComparison {
  return { size: w.size, iou: w.iou, projected: bytes(w.projected), target: bytes(w.target), valid: bytes(w.valid) };
}

/** What the Tealight and Bowl views read, assembled from a server preview. */
export interface TealightResult {
  kind: 'tealight' | 'bowl';
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  check: MeshCheck;
  warnings: string[];
  ms: number;
  lightZ: number;
  topZ: number;
  groundRadius: number;
  /** The unwrapped wall map can be downloaded (tealight only). */
  hasMap: boolean;
  fieldReport?: TealightMeta['fieldReport'] & FieldReport;
  comparison?: ShadowComparison;
  ribSuggestion?: RibSuggestion;
}

export function toTealightResult(p: { meta: TealightMeta; positions: Float32Array; indices: Uint32Array }): TealightResult {
  const m = p.meta;
  return {
    kind: m.kind, positions: p.positions, indices: p.indices, triangleCount: m.triangleCount, check: m.check,
    warnings: m.warnings, ms: m.ms, lightZ: m.lightZ, topZ: m.topZ, groundRadius: m.groundRadius,
    hasMap: m.kind === 'tealight', fieldReport: m.fieldReport as TealightResult['fieldReport'], ribSuggestion: m.ribSuggestion,
    comparison: m.comparison ? decodeComparison(m.comparison) : undefined,
  };
}

import type { BoxMeta, LightMeta, WallMeta } from '../contracts/outputs';

type Preview<M> = { meta: M; positions: Float32Array; indices: Uint32Array };

export interface WallResult {
  positions: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  check: MeshCheck;
  warnings: string[];
  ms: number;
  lightZ: number;
  topZ: number;
  groundRadius: number;
}
export function toWallResult(p: Preview<WallMeta>): WallResult {
  const m = p.meta;
  return { positions: p.positions, indices: p.indices, triangleCount: m.triangleCount, check: m.check, warnings: m.warnings, ms: m.ms, lightZ: m.lightZ, topZ: m.topZ, groundRadius: m.groundRadius };
}

export interface BoxResult {
  parts: BoxMeta['parts'];
  preview: { positions: Float32Array; indices: Uint32Array };
  light: BoxMeta['light'];
  warnings: string[];
  clamped: boolean;
  ms: number;
}
export function toBoxResult(p: Preview<BoxMeta>): BoxResult {
  const m = p.meta;
  return { parts: m.parts, preview: { positions: p.positions, indices: p.indices }, light: m.light, warnings: m.warnings, clamped: m.clamped, ms: m.ms };
}

export interface LightResult {
  mesh: { positions: Float32Array; indices: Uint32Array };
  triangleCount: number;
}
export function toLightResult(p: Preview<LightMeta>): LightResult {
  return { mesh: { positions: p.positions, indices: p.indices }, triangleCount: p.meta.triangleCount };
}
