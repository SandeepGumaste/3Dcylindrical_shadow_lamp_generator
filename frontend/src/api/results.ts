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
