import { getToken } from '@auth/core/jwt';
import { roleFor, type Role } from './roles';

export interface SessionUser {
  email: string;
  name: string;
  image: string;
  role: Role;
}

export async function getSessionUser(
  req: Request,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SessionUser | null> {
  if (!env.AUTH_SECRET) return null;
  try {
    const token = await getToken({
      req,
      secret: env.AUTH_SECRET,
      // Auth.js names the cookie (and uses that name as the salt) with a __Secure- prefix on https.
      secureCookie: new URL(req.url).protocol === 'https:',
    });
    if (!token || typeof token.email !== 'string') return null;
    if (token.role !== 'user' && token.role !== 'admin') return null;
    // The token's role was fixed at sign-in; never let it outlive a change of ADMIN_EMAIL.
    const role = token.role === 'admin' ? roleFor({ email: token.email, emailVerified: true }, env.ADMIN_EMAIL) : 'user';
    return {
      email: token.email,
      name: typeof token.name === 'string' ? token.name : '',
      image: typeof token.picture === 'string' ? token.picture : '',
      role,
    };
  } catch {
    return null;
  }
}
