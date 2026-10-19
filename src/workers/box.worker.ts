import { runBoxRequest, fetchPart, type BoxRequest, type BoxOutput } from './boxCompute';

export type BoxWorkerMessage =
  | { type: 'done'; result: BoxOutput }
  | { type: 'error'; error: string };

self.onmessage = async (e: MessageEvent<BoxRequest>) => {
  try {
    const result = await runBoxRequest(e.data, fetchPart);
    const transfer: Transferable[] = [result.zip, result.preview.positions.buffer, result.preview.indices.buffer, ...result.parts.map((p) => p.stl)];
    (self as unknown as Worker).postMessage({ type: 'done', result } satisfies BoxWorkerMessage, transfer);
  } catch (err: any) {
    (self as unknown as Worker).postMessage({ type: 'error', error: err?.message || 'Generation failed' } satisfies BoxWorkerMessage);
  }
};
