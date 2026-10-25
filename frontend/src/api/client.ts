import type { GenerateRequest } from '../contracts/api';
import { ApiError } from './errors';
import { unframeResponse } from './frame';

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3001';

/** Base64 of the raw little-endian Float32 values, the format the API expects for an image. */
export function encodeGray(pixels: Float32Array): string {
  const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function post(req: GenerateRequest, signal: AbortSignal | undefined, fetchFn: typeof fetch): Promise<Response> {
  const res = await fetchFn(`${API_URL}/api/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (res.ok) return res;
  let message = `Request failed (${res.status}).`;
  let errors: string[] | undefined;
  try {
    const body = (await res.json()) as { error?: string; errors?: string[] };
    if (body.error) message = body.error;
    errors = body.errors;
  } catch {
    /* not JSON (a proxy error page): keep the generic message */
  }
  throw new ApiError(res.status, message, errors);
}

export async function generate(req: GenerateRequest, signal?: AbortSignal, fetchFn: typeof fetch = fetch) {
  const res = await post(req, signal, fetchFn);
  return unframeResponse(await res.arrayBuffer());
}

export interface Downloaded { blob: Blob; filename: string; warnings: string[] }

export async function download(req: GenerateRequest, fetchFn: typeof fetch = fetch): Promise<Downloaded> {
  const res = await post(req, undefined, fetchFn);
  const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'odd-shadows-download';
  let warnings: string[] = [];
  try {
    const raw = res.headers.get('x-warnings');
    if (raw) warnings = JSON.parse(decodeURIComponent(raw)) as string[];
  } catch {
    /* a malformed header only loses the warnings */
  }
  return { blob: await res.blob(), filename, warnings };
}

/** Saves a downloaded file through the browser. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
