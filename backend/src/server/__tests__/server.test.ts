import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../routes';

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.AUTH_SECRET = 'test-secret';
  process.env.GOOGLE_CLIENT_ID = 'id';
  process.env.GOOGLE_CLIENT_SECRET = 'secret';
  server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('server', () => {
  it('answers 401 on /api/me without a session', async () => {
    const res = await fetch(`${base}/api/me`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });
  it('answers 404 JSON for unknown api paths', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });
  it('lists the google provider', async () => {
    const res = await fetch(`${base}/api/auth/providers`);
    expect(res.status).toBe(200);
    expect(Object.keys(await res.json())).toContain('google');
  });
  it('answers 401 on POST /api/generate without a session', async () => {
    const res = await fetch(`${base}/api/generate`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });
  it('answers the CORS preflight for the frontend origin', async () => {
    const res = await fetch(`${base}/api/generate`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });
});
