import React, { createContext, useContext } from 'react';
import { Brand } from '../components/Brand';
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

const Screen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-dvh w-full bg-slate-950 text-slate-100 font-sans antialiased flex flex-col">
    <Brand />
    <main className="flex-1 grid place-items-center p-6 text-center">{children}</main>
  </div>
);

const button = 'min-h-11 px-5 py-2.5 rounded-md bg-amber-500 text-slate-950 text-sm font-semibold hover:bg-amber-400';

/** Renders the app only for signed-in users; everyone else gets a sign-in screen. */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, failed, retry } = useSession();

  if (failed) {
    return (
      <Screen>
        <div className="space-y-4">
          <p className="text-sm text-slate-300">Could not check your sign-in. Check your connection and try again.</p>
          <button type="button" onClick={retry} className={button}>Retry</button>
        </div>
      </Screen>
    );
  }
  if (state.status === 'loading') return <Screen><p className="text-sm text-slate-400">Loading…</p></Screen>;
  if (state.status === 'signedOut') {
    return (
      <Screen>
        <div className="space-y-4">
          <p className="text-sm text-slate-300">Sign in to use Odd Shadows.</p>
          <button type="button" onClick={() => void signIn()} className={button}>Sign in with Google</button>
        </div>
      </Screen>
    );
  }
  return <UserContext.Provider value={state.user}>{children}</UserContext.Provider>;
};
