import type { SessionState, SessionUser } from './types';

export async function fetchSession(fetchFn: typeof fetch = fetch): Promise<SessionState> {
  const res = await fetchFn('/api/me', { credentials: 'same-origin' });
  if (res.status === 401) return { status: 'signedOut' };
  if (!res.ok) throw new Error(`session check failed: ${res.status}`);
  return { status: 'signedIn', user: (await res.json()) as SessionUser };
}

/** Auth.js wants a CSRF-protected form POST, which ends in a full-page redirect. */
async function postForm(action: string) {
  const { csrfToken } = (await (await fetch('/api/auth/csrf')).json()) as { csrfToken: string };
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  for (const [name, value] of Object.entries({ csrfToken, callbackUrl: window.location.href })) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export const signIn = () => postForm('/api/auth/signin/google');
export const signOut = () => postForm('/api/auth/signout');
