import { describe, expect, it } from 'vitest';
import { withCors } from '../cors';

const ALLOWED = 'https://odd.example';
const inner = withCors(async () => new Response('{"ok":true}', { status: 200 }), ALLOWED);
const req = (origin: string | null, method = 'POST') =>
  new Request('http://api.local/api/generate', { method, headers: origin ? { origin } : {} });

describe('withCors', () => {
  it('answers the preflight from the allowed origin with credentials and the needed headers', async () => {
    const res = await inner(req(ALLOWED, 'OPTIONS'));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
    expect(res.headers.get('access-control-allow-headers')).toBe('content-type');
    expect(res.headers.get('vary')).toContain('Origin');
  });
  it('gives no allow headers to any other origin', async () => {
    for (const method of ['OPTIONS', 'POST']) {
      const res = await inner(req('https://evil.example', method));
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    }
  });
  it('adds the headers, including content-disposition exposure, to a normal response from the allowed origin', async () => {
    const res = await inner(req(ALLOWED));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED);
    expect(res.headers.get('access-control-expose-headers')).toBe('content-disposition, x-warnings');
  });
  it('leaves a request without an Origin untouched', async () => {
    const res = await inner(req(null));
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
