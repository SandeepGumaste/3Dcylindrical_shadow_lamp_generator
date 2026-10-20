import type { GrayImage } from '../types';
import type { BoxParams } from '../geometry/box/rimProfile';
import { buildKit, type PartLoader } from '../geometry/box/kit';

export interface BoxRequest {
  shadow: GrayImage;
  panel: GrayImage;
  params: BoxParams;
}

export interface BoxOutput {
  parts: { id: string; label: string; generated: boolean; stl: ArrayBuffer }[];
  /** Assembled tray, panel and walls for the 3D view (tray frame, z up from the mounting wall). */
  preview: { positions: Float32Array; indices: Uint32Array };
  light: { x: number; y: number; z: number };
  zip: ArrayBuffer;
  warnings: string[];
  clamped: boolean;
  ms: number;
}

/** Pure compute shared by the worker and the main-thread fallback. */
export async function runBoxRequest(req: BoxRequest, load: PartLoader): Promise<BoxOutput> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const kit = await buildKit(req.shadow, req.panel, req.params, load);
  const zip = kit.zip.buffer.slice(kit.zip.byteOffset, kit.zip.byteOffset + kit.zip.byteLength) as ArrayBuffer;
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    parts: kit.parts.map((p) => ({ id: p.id, label: p.label, generated: p.generated, stl: p.stl })),
    preview: kit.preview,
    light: kit.light,
    zip,
    warnings: kit.warnings,
    clamped: kit.clamped,
    ms: t1 - t0,
  };
}

/** Loads a bundled part from `public/box-kit/` in the browser. */
export const fetchPart: PartLoader = async (file) => {
  const res = await fetch(`${import.meta.env.BASE_URL}box-kit/${file}`);
  if (!res.ok) throw new Error(`Could not load ${file} (${res.status}).`);
  return res.arrayBuffer();
};
