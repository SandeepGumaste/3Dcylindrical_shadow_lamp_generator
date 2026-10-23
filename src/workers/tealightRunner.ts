import { runTealightRequest, TealightRequest, TealightOutput } from './tealightCompute';
import type { TealightWorkerMessage } from './tealight.worker';

/** One running worker per request group, so a flat strip run never cancels an upright run. */
const active: Record<'main' | 'flat', Worker | null> = { main: null, flat: null };

/** Runs generation in a worker (cancelling any previous run); falls back to the main thread. */
export function runTealight(req: TealightRequest): Promise<TealightOutput> {
  const slot = req.kind === 'flat' ? 'flat' : 'main';
  active[slot]?.terminate();
  active[slot] = null;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./tealight.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve().then(() => runTealightRequest(req));
  }
  active[slot] = worker;
  return new Promise<TealightOutput>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<TealightWorkerMessage>) => {
      if (active[slot] === worker) active[slot] = null;
      worker.terminate();
      if (e.data.type === 'done') resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (err) => {
      if (active[slot] === worker) active[slot] = null;
      worker.terminate();
      reject(new Error(err.message || 'Worker error'));
    };
    worker.postMessage(req);
  });
}

/** Rejected promises from a cancelled run never settle; callers should ignore stale results by token. */
