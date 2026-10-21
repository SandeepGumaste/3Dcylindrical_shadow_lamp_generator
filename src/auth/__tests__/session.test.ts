import { describe, expect, it } from 'vitest';
import { fetchSession } from '../session';

const user = { email: 'a@x.com', name: 'A', image: 'a.png', role: 'user' as const };
const respond = (status: number, body: unknown = {}) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('fetchSession', () => {
  it('returns signedIn with the user on 200', async () => {
    expect(await fetchSession(respond(200, user))).toEqual({ status: 'signedIn', user });
  });
  it('returns signedOut on 401', async () => {
    expect(await fetchSession(respond(401, { error: 'unauthorized' }))).toEqual({ status: 'signedOut' });
  });
  it('rejects on a 500', async () => {
    await expect(fetchSession(respond(500))).rejects.toThrow();
  });
  it('rejects when the network fails', async () => {
    const failing = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
    await expect(fetchSession(failing)).rejects.toThrow('network');
  });
});
