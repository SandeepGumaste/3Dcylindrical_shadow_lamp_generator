import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevServer } from '../dev';

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.AUTH_SECRET = 'test-secret';
  process.env.GOOGLE_CLIENT_ID = 'id';
  process.env.GOOGLE_CLIENT_SECRET = 'secret';
  server = createDevServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('dev server', () => {
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
});
