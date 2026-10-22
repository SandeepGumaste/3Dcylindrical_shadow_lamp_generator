export type Role = 'user' | 'admin';

export function roleFor(
  profile: { email: string; emailVerified: boolean },
  adminEmail: string | undefined,
): Role {
  if (!adminEmail || !profile.emailVerified) return 'user';
  return profile.email.toLowerCase() === adminEmail.toLowerCase() ? 'admin' : 'user';
}
