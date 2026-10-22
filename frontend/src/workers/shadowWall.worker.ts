import { runShadowWallRequest, ShadowWallRequest, ShadowWallOutput } from './shadowWallCompute';

export type ShadowWallWorkerMessage =
  | { type: 'done'; result: ShadowWallOutput }
  | { type: 'error'; error: string };

self.onmessage = (e: MessageEvent<ShadowWallRequest>) => {
  try {
    const result = runShadowWallRequest(e.data);
    const transfer: Transferable[] = [result.positions.buffer, result.indices.buffer, result.stl];
    (self as unknown as Worker).postMessage({ type: 'done', result } satisfies ShadowWallWorkerMessage, transfer);
  } catch (err: any) {
    (self as unknown as Worker).postMessage({ type: 'error', error: err?.message || 'Generation failed' } satisfies ShadowWallWorkerMessage);
  }
};
