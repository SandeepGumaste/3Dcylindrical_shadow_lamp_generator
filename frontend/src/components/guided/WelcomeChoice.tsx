import React, { useEffect, useRef } from 'react';
import type { Experience } from '../../ui/experience';

/**
 * First visit: asks whether the person is new, so beginners get the guided steps and everyone else the full panel.
 * A native modal dialog: focus stays inside it, the page behind is inert, and Escape does not close it
 * (an answer is needed to pick the view).
 */
export const WelcomeChoice: React.FC<{ onChoose: (value: Experience) => void }> = ({ onChoose }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby="welcome-title" onCancel={(e) => e.preventDefault()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-200 shadow-2xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm">
      <h2 id="welcome-title" className="text-xl font-semibold text-slate-100">Welcome to Odd <span className="text-amber-300">Shadows</span></h2>
      <p className="mt-1 text-sm text-slate-400">Turn any image into a printable shadow lamp.</p>
      <p className="mt-5 text-base font-medium text-slate-100">Are you new to making lamps like this?</p>
      <p className="mt-1 text-xs text-slate-500">You can switch any time from the top of the page.</p>
      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <button type="button" onClick={() => onChoose('guided')}
          className="flex-1 min-h-11 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-300">
          Yes, guide me
        </button>
        <button type="button" onClick={() => onChoose('advanced')}
          className="flex-1 min-h-11 rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800">
          No, show me everything
        </button>
      </div>
    </dialog>
  );
};
