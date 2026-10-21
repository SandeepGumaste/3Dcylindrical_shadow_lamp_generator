import type { IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { toWebRequest } from '../node-adapter';

const incoming = (headers: Record<string, string>) =>
  ({ method: 'GET', url: '/api/me', headers }) as unknown as IncomingMessage;
const spoofed = { host: 'localhost:3000', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' };

afterEach(() => { delete process.env.VERCEL; });

describe('toWebRequest', () => {
  it('ignores forwarded headers outside Vercel and uses the base URL origin', () => {
    expect(toWebRequest(incoming(spoofed), 'http://localhost:3000').url).toBe('http://localhost:3000/api/me');
  });
  it('trusts forwarded headers on Vercel', () => {
    process.env.VERCEL = '1';
    expect(toWebRequest(incoming(spoofed), 'http://localhost:3000').url).toBe('https://evil.example/api/me');
  });
});
