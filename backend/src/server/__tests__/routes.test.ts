import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { encode } from '@auth/core/jwt';
import { handleGenerate } from '../routes';
import { encodeGray } from '../../generate/request';
import { unframeResponse } from '../../generate/frame';
import { syntheticImage } from '../../__golden__/syntheticImage';
import { MAX_BODY_BYTES } from '../../contracts/api';

const golden = JSON.parse(readFileSync(new URL('../../__golden__/golden.json', import.meta.url), 'utf8'));
const env = { AUTH_SECRET: 'test-secret', ADMIN_EMAIL: 'a@x.com' } as NodeJS.ProcessEnv;
const COOKIE = 'authjs.session-token';
const image = { kind: 'gray', width: 512, height: 512, pixels: encodeGray(syntheticImage()) };

async function cookie() {
  const jwt = await encode({ token: { email: 'a@x.com', name: 'A', picture: '', role: 'user' }, secret: 'test-secret', salt: COOKIE });
  return `${COOKIE}=${jwt}`;
}
function limiter(ok = true) {
  const calls: string[] = [];
  return { calls, hit: async (email: string) => { calls.push(email); return ok ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: 42 }; } };
}
async function post(body: unknown, opts: { cookie?: string | null; method?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const c = opts.cookie === undefined ? await cookie() : opts.cookie;
  if (c) headers.cookie = c;
  const raw = opts.raw ?? JSON.stringify(body);
  return new Request('http://localhost/api/generate', { method: opts.method ?? 'POST', headers, body: opts.method === 'GET' ? undefined : raw });
}
const base = { mode: 'tealight', image, params: {}, output: 'preview' };

describe('POST /api/generate', () => {
  it('answers 401 without a session and does not touch the limiter', async () => {
    const l = limiter();
    const res = await handleGenerate(await post(base, { cookie: null }), { limiter: l, env });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('{"error":"unauthorized"}');
    expect(l.calls).toHaveLength(0);
  });
  it('answers 405 for other methods', async () => {
    expect((await handleGenerate(await post(base, { method: 'GET' }), { limiter: limiter(), env })).status).toBe(405);
  });
  it('returns a framed preview whose triangle count matches the golden', async () => {
    const l = limiter();
    const res = await handleGenerate(await post(base), { limiter: l, env });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { meta, indices } = unframeResponse(await res.arrayBuffer());
    expect(meta.triangleCount).toBe(golden['tealight-default'].triangleCount);
    expect(indices.length / 3).toBe(golden['tealight-default'].triangleCount);
    expect(l.calls).toEqual(['a@x.com']);
  }, 60_000);
  it('returns a file download with its type and filename', async () => {
    const res = await handleGenerate(await post({ ...base, mode: 'light', image: undefined, output: 'stl' }), { limiter: limiter(), env });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('model/stl');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="wiring-bracket-100mm\.stl"$/);
  });
  it('answers 413 for a body over the limit', async () => {
    const res = await handleGenerate(await post(null, { raw: 'x'.repeat(MAX_BODY_BYTES + 10) }), { limiter: limiter(), env });
    expect(res.status).toBe(413);
  });
  it('answers 400 for a body that is not JSON', async () => {
    const res = await handleGenerate(await post(null, { raw: '{nope' }), { limiter: limiter(), env });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });
  it('answers 422 with the validator messages for an invalid setting', async () => {
    const res = await handleGenerate(await post({ ...base, params: { height: -5 } }), { limiter: limiter(), env });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors.length).toBeGreaterThan(0);
  });
  it('answers 429 with Retry-After when the limiter refuses', async () => {
    const res = await handleGenerate(await post(base), { limiter: limiter(false), env });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
    expect(await res.json()).toEqual({ error: 'Too many requests, try again in a few minutes' });
  });
  it('answers 500 with a fixed body when generation throws, never the stack', async () => {
    const res = await handleGenerate(await post(base), {
      limiter: limiter(), env, generate: async () => { throw new Error('secret internals at /srv/app'); },
    });
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('{"error":"generation failed"}');
  });
});
