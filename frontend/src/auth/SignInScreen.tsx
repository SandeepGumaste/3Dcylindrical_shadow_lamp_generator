import React, { useState } from 'react';
import { Brand } from '../components/Brand';

const GoogleMark: React.FC = () => (
  <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

const primary = 'min-h-11 w-full px-5 py-2.5 rounded-md bg-amber-500 text-slate-950 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60 disabled:cursor-wait';

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-dvh w-full bg-slate-950 text-slate-100 font-sans antialiased flex flex-col">
    <Brand />
    <main className="flex-1 grid place-items-center px-4 py-8">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 text-center shadow-xl shadow-black/30">
        {children}
      </div>
    </main>
  </div>
);

/** Card shown while the session is being checked. */
export const CheckingScreen: React.FC = () => (
  <Frame>
    <div role="status" className="flex flex-col items-center gap-3 py-4">
      <span className="size-6 rounded-full border-2 border-slate-700 border-t-amber-400 animate-spin" aria-hidden="true" />
      <p className="text-sm text-slate-400">Checking your sign-in…</p>
    </div>
  </Frame>
);

/** Card shown when the session check itself failed (offline, API down). */
export const SignInErrorScreen: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <Frame>
    <div className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">Can’t reach the server</h2>
      <p role="alert" className="text-sm text-slate-300">Could not check your sign-in. Check your connection and try again.</p>
      <button type="button" onClick={onRetry} className={primary}>Retry</button>
    </div>
  </Frame>
);

/** The sign-in card: explains why sign-in is needed and starts the Google flow. */
export const SignInScreen: React.FC<{ onSignIn: () => void | Promise<void> }> = ({ onSignIn }) => {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = async () => {
    setPending(true);
    setFailed(false);
    try {
      await onSignIn(); // ends in a full-page redirect to Google
    } catch {
      setPending(false);
      setFailed(true);
    }
  };
  return (
    <Frame>
      <div className="space-y-5">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">Sign in to Odd <span className="text-amber-300">Shadows</span></h2>
          <p className="text-sm text-slate-300">Turn any image into a printable shadow lamp.</p>
        </div>
        <button type="button" onClick={() => void start()} disabled={pending} aria-busy={pending}
          className="min-h-11 w-full inline-flex items-center justify-center gap-3 rounded-md bg-white px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-70 disabled:cursor-wait">
          <GoogleMark />
          {pending ? 'Redirecting to Google…' : 'Continue with Google'}
        </button>
        {failed && <p role="alert" className="text-sm text-amber-300">Could not start sign-in. Please try again.</p>}
        <p className="text-xs text-slate-400">You need to sign in to generate and download models. We use your Google account only to identify you.</p>
      </div>
    </Frame>
  );
};
