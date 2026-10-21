import { describe, expect, it } from 'vitest';
import { encode } from '@auth/core/jwt';
import { getSessionUser } from '../session';
import { handleMe } from '../me';

const env = { AUTH_SECRET: 'test-secret', ADMIN_EMAIL: 'A@x.com' } as NodeJS.ProcessEnv;
const COOKIE = 'authjs.session-token';

async function reqWith(cookie?: string) {
  return new Request('http://localhost/api/me', { headers: cookie ? { cookie } : {} });
}
async function tokenFor(secret: string) {
  return encode({
    token: { email: 'a@x.com', name: 'A', picture: 'a.png', role: 'admin' },
    secret,
    salt: COOKIE,
  });
}

describe('getSessionUser', () => {
  it('returns the user from a valid session cookie', async () => {
    const jwt = await tokenFor('test-secret');
    expect(await getSessionUser(await reqWith(`${COOKIE}=${jwt}`), env)).toEqual({
      email: 'a@x.com', name: 'A', image: 'a.png', role: 'admin',
    });
  });
  it('returns null without a cookie', async () => {
    expect(await getSessionUser(await reqWith(), env)).toBeNull();
  });
  it('returns null for a garbage cookie', async () => {
    expect(await getSessionUser(await reqWith(`${COOKIE}=garbage`), env)).toBeNull();
  });
  it('returns null for a token signed with another secret', async () => {
    const jwt = await tokenFor('other-secret');
    expect(await getSessionUser(await reqWith(`${COOKIE}=${jwt}`), env)).toBeNull();
  });
});

describe('getSessionUser on https', () => {
  it('reads the __Secure- cookie, whose name is also the token salt', async () => {
    const name = '__Secure-authjs.session-token';
    const jwt = await encode({
      token: { email: 'a@x.com', name: 'A', picture: 'a.png', role: 'admin' },
      secret: 'test-secret',
      salt: name,
    });
    const req = new Request('https://odd.example/api/me', { headers: { cookie: `${name}=${jwt}` } });
    expect((await getSessionUser(req, env))?.email).toBe('a@x.com');
  });
});

describe('role re-check against ADMIN_EMAIL', () => {
  it('demotes a token-admin whose email is no longer ADMIN_EMAIL', async () => {
    const jwt = await tokenFor('test-secret');
    const user = await getSessionUser(await reqWith(`${COOKIE}=${jwt}`), { ...env, ADMIN_EMAIL: 'someone@else.com' });
    expect(user?.role).toBe('user');
  });
  it('demotes a token-admin when ADMIN_EMAIL is unset', async () => {
    const jwt = await tokenFor('test-secret');
    const user = await getSessionUser(await reqWith(`${COOKIE}=${jwt}`), { AUTH_SECRET: 'test-secret' } as NodeJS.ProcessEnv);
    expect(user?.role).toBe('user');
  });
});

describe('handleMe', () => {
  it('answers 401 with exactly the unauthorized body when signed out', async () => {
    const res = await handleMe(await reqWith(`${COOKIE}=garbage`), env);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('{"error":"unauthorized"}');
  });
  it('answers 200 with the user when signed in', async () => {
    const jwt = await tokenFor('test-secret');
    const res = await handleMe(await reqWith(`${COOKIE}=${jwt}`), env);
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe('admin');
  });
});
