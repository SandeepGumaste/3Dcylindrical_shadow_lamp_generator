import { Auth, type AuthConfig } from '@auth/core';
import Google from '@auth/core/providers/google';
import { roleFor } from './roles';
import { createMongoUserStore, type UserStore } from './users';

type GoogleProfile = { email?: string; email_verified?: boolean; name?: string; picture?: string };

export function buildAuthConfig(store: UserStore, env: NodeJS.ProcessEnv): AuthConfig {
  const roleOf = (p: GoogleProfile) =>
    roleFor({ email: p.email ?? '', emailVerified: p.email_verified === true }, env.ADMIN_EMAIL);

  return {
    providers: [Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET })],
    secret: env.AUTH_SECRET,
    basePath: '/api/auth',
    trustHost: true,
    session: { strategy: 'jwt' },
    callbacks: {
      async signIn({ profile }) {
        const p = (profile ?? {}) as GoogleProfile;
        if (!p.email) return false;
        try {
          await store.upsert({ email: p.email, name: p.name ?? '', image: p.picture ?? '', role: roleOf(p) });
          return true;
        } catch {
          return false;
        }
      },
      async jwt({ token, profile }) {
        // `profile` is only present on sign-in; later refreshes keep the stored role.
        if (profile) token.role = roleOf(profile as GoogleProfile);
        return token;
      },
      async session({ session, token }) {
        if (session.user) (session.user as { role?: unknown }).role = token.role;
        return session;
      },
    },
  };
}

export function authHandler(req: Request): Promise<Response> {
  return Auth(req, buildAuthConfig(createMongoUserStore(), process.env));
}
