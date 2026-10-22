import { describe, expect, it } from 'vitest';
import { createGenerationSession } from '../generationSession';
import { ApiError } from '../errors';
import type { GenerateRequest } from '../../contracts/api';

const mk = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({ mode: 'wall', params: { height: 70 }, output: 'preview', ...over });
const ok = (n: number) => ({ meta: { n }, positions: new Float32Array(), indices: new Uint32Array() });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('generation session', () => {
  it('applies only the newest of two quick runs and aborts the older request', async () => {
    const first = deferred<ReturnType<typeof ok>>();
    const second = deferred<ReturnType<typeof ok>>();
    const signals: AbortSignal[] = [];
    const queue = [first, second];
    const s = createGenerationSession({
      generate: async (_r, signal) => { signals.push(signal!); return queue.shift()!.promise; },
      download: async () => ({ blob: new Blob(), filename: 'x' }),
      onUnauthorized: () => {},
    });
    const a = s.run(mk());
    const b = s.run(mk({ params: { height: 80 } }));
    second.resolve(ok(2));
    first.resolve(ok(1));
    expect(await b).toMatchObject({ kind: 'ok', value: { meta: { n: 2 } } });
    expect(await a).toEqual({ kind: 'stale' });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('downloads with the settings of the last Generate, not later edits', async () => {
    const sent: GenerateRequest[] = [];
    const s = createGenerationSession({
      generate: async () => ok(1),
      download: async (r) => { sent.push(r); return { blob: new Blob(), filename: 'f.stl' }; },
      onUnauthorized: () => {},
    });
    const req = mk();
    await s.run(req);
    (req.params as { height: number }).height = 999; // the caller keeps editing its form object
    await s.downloadLast('stl');
    expect(sent[0].output).toBe('stl');
    expect((sent[0].params as { height: number }).height).toBe(70);
  });

  it('has nothing to download before the first successful run', async () => {
    const s = createGenerationSession({ generate: async () => { throw new ApiError(500, 'x'); }, download: async () => ({ blob: new Blob(), filename: 'x' }), onUnauthorized: () => {} });
    await s.run(mk());
    expect(await s.downloadLast('stl')).toBeNull();
  });

  it('calls onUnauthorized and asks to sign in again on a 401', async () => {
    let fired = 0;
    const s = createGenerationSession({
      generate: async () => { throw new ApiError(401, 'unauthorized'); },
      download: async () => ({ blob: new Blob(), filename: 'x' }),
      onUnauthorized: () => { fired++; },
    });
    expect(await s.run(mk())).toEqual({ kind: 'error', message: 'Please sign in again.' });
    expect(fired).toBe(1);
  });

  it('reports the server messages on 422 and the server text on 429', async () => {
    const mkSession = (e: ApiError) => createGenerationSession({ generate: async () => { throw e; }, download: async () => ({ blob: new Blob(), filename: 'x' }), onUnauthorized: () => {} });
    expect(await mkSession(new ApiError(422, 'a', ['a', 'b'])).run(mk())).toEqual({ kind: 'invalid', errors: ['a', 'b'] });
    expect(await mkSession(new ApiError(429, 'Too many requests, try again in a few minutes')).run(mk())).toEqual({ kind: 'error', message: 'Too many requests, try again in a few minutes' });
  });

  it('describes a network failure plainly', async () => {
    const s = createGenerationSession({ generate: async () => { throw new TypeError('Failed to fetch'); }, download: async () => ({ blob: new Blob(), filename: 'x' }), onUnauthorized: () => {} });
    expect(await s.run(mk())).toEqual({ kind: 'error', message: 'Could not reach the server. Check your connection and try again.' });
  });
});
