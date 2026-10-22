import type { Output } from '../contracts/api';
import { ApiError } from './errors';
import { saveBlob } from './client';
import { notifyUnauthorized } from './unauthorized';
import type { createGenerationSession } from './generationSession';

/** Downloads the last generated model in `output` form and saves it; reports a failure through `onError`. `filename` overrides the server's name. */
export async function saveLast(
  session: ReturnType<typeof createGenerationSession>,
  output: Output,
  filename: string | undefined,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const out = await session.downloadLast(output);
    if (out) saveBlob(out.blob, filename ?? out.filename);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) notifyUnauthorized();
    onError(e instanceof ApiError ? e.message : 'Download failed. Check your connection and try again.');
  }
}
