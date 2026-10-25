import type { ShadowComparison, ShadowComparisonWire, TealightMeta, WallMeta, BoxMeta, LightMeta } from '../contracts/outputs';
import { RequestError, type ParsedRequest } from './request';
import { loadBracketSample, loadKitPart } from './assets';
import { runTealightRequest } from '../compute/tealightCompute';
import { runShadowWallRequest } from '../compute/shadowWallCompute';
import { runBoxRequest } from '../compute/boxCompute';
import { fitShadowSize as fitWall } from '../geometry/shadowWall/shadowWall';
import { fitShadowSize as fitBox } from '../geometry/box/rimProfile';
import { buildBracket } from '../geometry/lightSource/bracket';
import { indexedMeshToBinarySTL } from '../geometry/stl';

export type GenerateResult =
  | { kind: 'framed'; meta: object; positions: Float32Array; indices: Uint32Array }
  | { kind: 'file'; body: ArrayBuffer | string; contentType: string; filename: string; warnings?: string[] };

const STL = 'model/stl';
const file = (body: ArrayBuffer | string, contentType: string, filename: string): GenerateResult => ({ kind: 'file', body, contentType, filename });
const refuse = (output: string, mode: string) => new RequestError(422, `The ${mode} mode cannot produce ${output} output.`);
const b64 = (a: Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const wireComparison = (c: ShadowComparison): ShadowComparisonWire => ({ size: c.size, iou: c.iou, projected: b64(c.projected), target: b64(c.target), valid: b64(c.valid) });

export async function generate(req: ParsedRequest): Promise<GenerateResult> {
  const { mode, image, params, output } = req;

  if (mode === 'tealight' || mode === 'bowl') {
    const out = runTealightRequest(mode === 'tealight' ? { kind: 'tealight', image: image!, params } : { kind: 'bowl', image: image!, params });
    if (output === 'stl') return file(out.stl, STL, `odd-shadows-${mode}.stl`);
    if (output === 'svg') {
      if (!out.mapSvg) throw refuse('svg', mode);
      return file(out.mapSvg, 'image/svg+xml', `odd-shadows-${mode}-map.svg`);
    }
    if (output !== 'preview') throw refuse(typeof output === 'string' ? output : 'part', mode);
    const meta: TealightMeta = {
      kind: out.kind as TealightMeta['kind'], triangleCount: out.triangleCount, check: out.check, warnings: out.warnings, ms: out.ms,
      lightZ: out.lightZ, topZ: out.topZ, groundRadius: out.groundRadius,
      fieldReport: out.fieldReport, ribSuggestion: out.ribSuggestion,
      comparison: out.comparison ? wireComparison(out.comparison) : undefined,
    };
    return { kind: 'framed', meta, positions: out.positions, indices: out.indices };
  }

  if (mode === 'flat') {
    const { layerHeight, layers, ...tealight } = params;
    const out = runTealightRequest({ kind: 'flat', image: image!, params: tealight, flat: { layerHeight, layers } });
    if (!out.check.watertight) throw new RequestError(422, `Flat strip is not watertight: ${out.check.errors.join(' ')}`);
    if (output !== 'zip') throw refuse(typeof output === 'string' ? output : 'part', mode);
    const zip = out.zip!;
    const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    return { kind: 'file', body, contentType: 'application/zip', filename: 'odd-shadows-flat-strip.zip', warnings: out.warnings };
  }

  if (mode === 'wall') {
    const fit = req.fit ? fitWall(image!, params) : undefined;
    const used = fit ? { ...params, shadowSize: fit.shadowSize } : params;
    const out = runShadowWallRequest({ image: image!, params: used });
    if (output === 'stl') return file(out.stl, STL, 'odd-shadows-shadow-wall.stl');
    if (output !== 'preview') throw refuse(typeof output === 'string' ? output : 'part', mode);
    const meta: WallMeta = { triangleCount: out.triangleCount, supportIndexStart: out.supportIndexStart, check: out.check, warnings: out.warnings, ms: out.ms, lightZ: out.lightZ, topZ: out.topZ, groundRadius: out.groundRadius, fit };
    return { kind: 'framed', meta, positions: out.positions, indices: out.indices };
  }

  if (mode === 'box') {
    const fit = req.fit ? fitBox(image!, params) : undefined;
    const used = fit ? { ...params, shadowSize: fit.shadowSize } : params;
    const out = await runBoxRequest({ shadow: image!, panel: req.panel ?? image!, params: used }, loadKitPart);
    if (output === 'zip') return file(out.zip, 'application/zip', 'odd-shadows-box-kit.zip');
    if (typeof output === 'object') {
      const part = out.parts.find((p) => p.id === output.part);
      if (!part) throw new RequestError(422, `Unknown part "${output.part}".`);
      return file(part.stl, STL, `${part.id}.stl`);
    }
    if (output !== 'preview') throw refuse(output, mode);
    const meta: BoxMeta = { parts: out.parts.map((p) => ({ id: p.id, label: p.label, generated: p.generated })), light: out.light, warnings: out.warnings, clamped: out.clamped, ms: out.ms, fit };
    return { kind: 'framed', meta, positions: out.preview.positions, indices: out.preview.indices };
  }

  const mesh = buildBracket(await loadBracketSample(), params);
  if (output === 'stl') return file(indexedMeshToBinarySTL(mesh.positions, mesh.indices, 'Odd Shadows wiring bracket'), STL, `wiring-bracket-${params.height}mm.stl`);
  if (output !== 'preview') throw refuse(typeof output === 'string' ? output : 'part', mode);
  const meta: LightMeta = { triangleCount: mesh.indices.length / 3 };
  return { kind: 'framed', meta, positions: mesh.positions, indices: mesh.indices };
}
