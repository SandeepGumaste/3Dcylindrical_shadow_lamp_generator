import React, { useEffect, useRef } from 'react';
import type { Experience } from '../../ui/experience';

/** First visit: asks whether the person is new, so beginners get the guided steps and everyone else the full panel. */
export const WelcomeChoice: React.FC<{ onChoose: (value: Experience) => void }> = ({ onChoose }) => {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-slate-200">
        <h2 id="welcome-title" className="text-xl font-semibold text-slate-100">Welcome to Odd <span className="text-amber-300">Shadows</span></h2>
        <p className="mt-1 text-sm text-slate-400">Turn any image into a printable shadow lamp.</p>
        <p className="mt-5 text-base font-medium text-slate-100">Are you new to making lamps like this?</p>
        <p className="mt-1 text-xs text-slate-500">You can switch any time from the top of the page.</p>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <button ref={first} type="button" onClick={() => onChoose('guided')}
            className="flex-1 min-h-11 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-300">
            Yes, guide me
          </button>
          <button type="button" onClick={() => onChoose('advanced')}
            className="flex-1 min-h-11 rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800">
            No, show me everything
          </button>
        </div>
      </div>
    </div>
  );
};
