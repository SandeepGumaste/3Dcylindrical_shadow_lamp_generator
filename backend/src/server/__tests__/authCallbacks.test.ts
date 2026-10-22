import { describe, expect, it } from 'vitest';
import { buildAuthConfig } from '../auth';
import type { UserStore } from '../users';

const env = { AUTH_SECRET: 's', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec', ADMIN_EMAIL: 'me@x.com' } as NodeJS.ProcessEnv;

function fakeStore() {
  const calls: { email: string; name: string; image: string; role: string }[] = [];
  const store: UserStore = {
    async upsert(u) {
      calls.push(u);
      return { ...u, createdAt: new Date() };
    },
  };
  return { store, calls };
}
const google = (email: string, email_verified: boolean) => ({
  account: { provider: 'google' },
  profile: { email, email_verified, name: 'N', picture: 'p.png' },
});

describe('auth callbacks', () => {
  it('stores the admin role for the verified admin email, ignoring case', async () => {
    const { store, calls } = fakeStore();
    const cfg = buildAuthConfig(store, env);
    const ok = await cfg.callbacks!.signIn!(google('ME@x.com', true) as never);
    expect(ok).toBe(true);
    expect(calls).toEqual([{ email: 'ME@x.com', name: 'N', image: 'p.png', role: 'admin' }]);
  });

  it('stores user for the admin email when Google says it is not verified', async () => {
    const { store, calls } = fakeStore();
    await buildAuthConfig(store, env).callbacks!.signIn!(google('me@x.com', false) as never);
    expect(calls[0].role).toBe('user');
  });

  it('refuses sign-in when the store fails', async () => {
    const store: UserStore = { upsert: async () => { throw new Error('mongo down'); } };
    const ok = await buildAuthConfig(store, env).callbacks!.signIn!(google('a@x.com', true) as never);
    expect(ok).toBe(false);
  });

  it('refuses sign-in when Google gives no email', async () => {
    const { store } = fakeStore();
    const ok = await buildAuthConfig(store, env).callbacks!.signIn!({ account: { provider: 'google' }, profile: {} } as never);
    expect(ok).toBe(false);
  });

  it('copies the role into the token and the session', async () => {
    const cfg = buildAuthConfig(fakeStore().store, env);
    const token = await cfg.callbacks!.jwt!({ token: {}, profile: { email: 'me@x.com', email_verified: true } } as never);
    expect(token?.role).toBe('admin');
    const session = await cfg.callbacks!.session!({ session: { user: {} }, token } as never);
    expect((session as unknown as { user: { role: string } }).user.role).toBe('admin');
  });

  it('keeps the existing role on later token refreshes', async () => {
    const cfg = buildAuthConfig(fakeStore().store, env);
    const token = await cfg.callbacks!.jwt!({ token: { role: 'user' } } as never);
    expect(token?.role).toBe('user');
  });
});
