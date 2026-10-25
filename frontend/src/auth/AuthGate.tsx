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

/** Renders the app only for signed-in users; everyone else gets a sign-in screen. */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, failed, retry } = useSession();

  if (failed) return <SignInErrorScreen onRetry={retry} />;
  if (state.status === 'loading') return <CheckingScreen />;
  if (state.status === 'signedOut') return <SignInScreen onSignIn={signIn} />;
  return <UserContext.Provider value={state.user}>{children}</UserContext.Provider>;
};
