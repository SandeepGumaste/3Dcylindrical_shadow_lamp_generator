import React, { createContext, useContext } from 'react';
import { CheckingScreen, SignInErrorScreen, SignInScreen } from './SignInScreen';
import { signIn } from './session';
import type { SessionUser } from './types';
import { useSession } from './useSession';

const UserContext = createContext<SessionUser | null>(null);

/** The signed-in user; only valid below <AuthGate>. */
export const useCurrentUser = (): SessionUser => {
  const user = useContext(UserContext);
  if (!user) throw new Error('useCurrentUser used outside a signed-in AuthGate');
  return user;
};

/**
 * Links on the public pages open `/app?signin=1`: signed-out visitors go straight to Google, signed-in ones just land in the app.
 * The flag is read once and removed from the address, so the return from Google (or a cancelled sign-in) does not start it again.
 */
const autoSignIn = (() => {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('signin')) return false;
  url.searchParams.delete('signin');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  return true;
})();

/** Renders the app only for signed-in users; everyone else gets a sign-in screen. */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, failed, retry } = useSession();

  if (failed) return <SignInErrorScreen onRetry={retry} />;
  if (state.status === 'loading') return <CheckingScreen />;
  if (state.status === 'signedOut') return <SignInScreen onSignIn={signIn} autoStart={autoSignIn} />;
  return <UserContext.Provider value={state.user}>{children}</UserContext.Provider>;
};
