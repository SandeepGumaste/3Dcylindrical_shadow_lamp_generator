import type { GenerateRequest, Output } from '../contracts/api';
import { ApiError } from './errors';

type Preview = { meta: any; positions: Float32Array; indices: Uint32Array };

export type RunOutcome =
  | { kind: 'ok'; value: Preview }
  | { kind: 'stale' }
  | { kind: 'invalid'; errors: string[] }
  | { kind: 'error'; message: string };

export interface SessionDeps {
  generate: (req: GenerateRequest, signal?: AbortSignal) => Promise<Preview>;
  download: (req: GenerateRequest) => Promise<{ blob: Blob; filename: string }>;
  onUnauthorized: () => void;
}

/**
 * One per generator. Newest run wins (older requests are aborted and reported stale), and the request
 * of the last successful run is kept so a download always matches the model on screen.
 */
export function createGenerationSession(deps: SessionDeps) {
  let counter = 0;
  let controller: AbortController | null = null;
  let last: GenerateRequest | null = null;

  return {
    async run(req: GenerateRequest): Promise<RunOutcome> {
      const mine = ++counter;
      controller?.abort();
      const own = (controller = new AbortController());
      const snapshot: GenerateRequest = JSON.parse(JSON.stringify(req));
      try {
        const value = await deps.generate(req, own.signal);
        if (mine !== counter) return { kind: 'stale' };
        last = snapshot;
        return { kind: 'ok', value };
      } catch (e) {
        if (mine !== counter) return { kind: 'stale' };
        if (e instanceof ApiError) {
          if (e.status === 401) {
            deps.onUnauthorized();
            return { kind: 'error', message: 'Please sign in again.' };
          }
          if (e.status === 422 && e.errors?.length) return { kind: 'invalid', errors: e.errors };
          return { kind: 'error', message: e.message };
        }
        if (e instanceof TypeError) return { kind: 'error', message: 'Could not reach the server. Check your connection and try again.' };
        return { kind: 'error', message: e instanceof Error ? e.message : 'Generation failed.' };
      }
    },

    /** Downloads in `output` form for the settings and image of the last successful run, or null if there was none. */
    async downloadLast(output: Output): Promise<{ blob: Blob; filename: string } | null> {
      if (!last) return null;
      return deps.download({ ...JSON.parse(JSON.stringify(last)), output, fit: undefined });
    },

    get last() { return last; },
  };
}
