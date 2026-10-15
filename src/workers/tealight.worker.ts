import { runTealightRequest, TealightRequest, TealightOutput } from './tealightCompute';

export type TealightWorkerMessage =
  | { type: 'done'; result: TealightOutput }
  | { type: 'error'; error: string };

self.onmessage = (e: MessageEvent<TealightRequest>) => {
  try {
    const result = runTealightRequest(e.data);
    const transfer: Transferable[] = [result.positions.buffer, result.indices.buffer, result.stl];
    if (result.comparison) transfer.push(result.comparison.projected.buffer, result.comparison.target.buffer, result.comparison.valid.buffer);
    (self as unknown as Worker).postMessage({ type: 'done', result } satisfies TealightWorkerMessage, transfer);
  } catch (err: any) {
    (self as unknown as Worker).postMessage({ type: 'error', error: err?.message || 'Generation failed' } satisfies TealightWorkerMessage);
  }
};
