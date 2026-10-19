import React from 'react';

/** Odd Shadows wordmark: a lamp shade throwing an off-centre shadow. */
export const Brand: React.FC = () => (
  <header className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/60">
    <svg viewBox="0 0 64 64" className="size-9 shrink-0" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0f172a" stroke="#334155" />
      <path d="M22 10h20l8 26H14z" fill="#fbbf24" />
      <ellipse cx="30" cy="47" rx="9" ry="3.2" fill="#f59e0b" opacity=".35" />
      <ellipse cx="38" cy="50" rx="17" ry="5.2" fill="#f59e0b" opacity=".6" />
    </svg>
    <div className="leading-tight">
      <h1 className="text-base font-semibold tracking-tight text-slate-100">Odd <span className="text-amber-300">Shadows</span></h1>
      <p className="text-[11px] text-slate-400">Turn any image into a printable shadow lamp</p>
    </div>
  </header>
);
