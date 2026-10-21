import { getToken } from '@auth/core/jwt';
import type { Role } from './roles';

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
    const token = await getToken({ req, secret: env.AUTH_SECRET });
    if (!token || typeof token.email !== 'string') return null;
    if (token.role !== 'user' && token.role !== 'admin') return null;
    return {
      email: token.email,
      name: typeof token.name === 'string' ? token.name : '',
      image: typeof token.picture === 'string' ? token.picture : '',
      role: token.role,
    };
  } catch {
    return null;
  }
}
