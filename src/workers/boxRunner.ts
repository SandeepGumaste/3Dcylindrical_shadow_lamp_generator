import { runBoxRequest, fetchPart, type BoxRequest, type BoxOutput } from './boxCompute';
import type { BoxWorkerMessage } from './box.worker';

let active: Worker | null = null;

/** Runs generation in a worker (cancelling any previous run); falls back to the main thread. */
export function runBox(req: BoxRequest): Promise<BoxOutput> {
  if (active) { active.terminate(); active = null; }
  let worker: Worker;
  try {
    worker = new Worker(new URL('./box.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return runBoxRequest(req, fetchPart);
  }
  active = worker;
  return new Promise<BoxOutput>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<BoxWorkerMessage>) => {
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
