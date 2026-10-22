import type { GenerateRequest, ImageRef, Mode } from '../contracts/api';
import type { FitResult, GrayImage } from '../contracts/outputs';
import { encodeGray } from './client';

export const grayRef = (img: GrayImage): ImageRef => ({ kind: 'gray', width: 512, height: 512, pixels: encodeGray(img.pixels) });

export function previewRequest(
  mode: Mode,
  params: object,
  opts: { image?: GrayImage; panel?: GrayImage; fit?: boolean } = {},
): GenerateRequest {
  const req: GenerateRequest = { mode, params: params as Record<string, unknown>, output: 'preview' };
  if (opts.image) req.image = grayRef(opts.image);
  if (opts.panel) req.panel = grayRef(opts.panel);
  if (opts.fit) req.fit = true;
  return req;
}

/** The settings with the shadow size the server fitted; the same object back when nothing changes. */
export function applyFit<P extends { shadowSize: number }>(params: P, fit: FitResult | undefined): { params: P; ok: boolean } {
  if (!fit) return { params, ok: true };
  return { params: fit.shadowSize === params.shadowSize ? params : { ...params, shadowSize: fit.shadowSize }, ok: fit.ok };
}
