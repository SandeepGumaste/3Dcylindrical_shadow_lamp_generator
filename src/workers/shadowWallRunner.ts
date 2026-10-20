import { runShadowWallRequest, ShadowWallRequest, ShadowWallOutput } from './shadowWallCompute';
import type { ShadowWallWorkerMessage } from './shadowWall.worker';

let active: Worker | null = null;

/** Runs generation in a worker (cancelling any previous run); falls back to the main thread. */
export function runShadowWall(req: ShadowWallRequest): Promise<ShadowWallOutput> {
  if (active) { active.terminate(); active = null; }
  let worker: Worker;
  try {
    worker = new Worker(new URL('./shadowWall.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve().then(() => runShadowWallRequest(req));
  }
  active = worker;
  return new Promise<ShadowWallOutput>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<ShadowWallWorkerMessage>) => {
      if (active === worker) active = null;
      worker.terminate();
      if (e.data.type === 'done') resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (err) => {
      if (active === worker) active = null;
      worker.terminate();
      reject(new Error(err.message || 'Worker error'));
    };
    worker.postMessage(req);
  });
}

/** Rejected promises from a cancelled run never settle; callers should ignore stale results by token. */
