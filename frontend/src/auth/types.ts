export type Role = 'user' | 'admin';

export interface SessionUser {
  email: string;
  name: string;
  image: string;
  role: Role;
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: SessionUser };
