import React from 'react';
import { Download } from 'lucide-react';
import type { LightSourceController } from '../hooks/useLightSourceGenerator';
import { MAX_HEIGHT, MIN_HEIGHT } from '../contracts/lightSource';

export const LightSourcePanel: React.FC<{ c: LightSourceController }> = ({ c }) => {
  const bad = c.errors.length > 0;
  const set = (v: number) => { if (!Number.isNaN(v)) c.setParams({ height: v }); };
  return (
    <div className="w-full lg:h-full flex flex-col bg-slate-900 lg:overflow-y-auto custom-scrollbar select-none text-slate-300 text-sm lg:text-xs">
      <section className="px-4 py-4 lg:py-3 border-b border-slate-800">
        <h3 className="text-[11px] lg:text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Wiring bracket</h3>
        <p className="text-slate-400 mb-3">Holder for the light source wiring. Set the height of your light source and download the matching part.</p>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-slate-300">
            <span>Light source height (&gt; {MIN_HEIGHT})</span>
            <span className="flex items-center gap-1">
              <input type="number" value={c.params.height} min={MIN_HEIGHT} max={MAX_HEIGHT} step={1} onChange={(e) => set(parseFloat(e.target.value))}
                className="w-20 lg:w-16 min-h-9 lg:min-h-0 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right text-base lg:text-xs text-slate-100" />
              <span className="text-slate-500 w-6">mm</span>
            </span>
          </span>
          <input type="range" value={Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, c.params.height))} min={MIN_HEIGHT} max={MAX_HEIGHT} step={1}
            onChange={(e) => set(parseFloat(e.target.value))} className="accent-amber-400 h-8 lg:h-auto" />
        </label>
        {c.errors.map((e) => <p key={e} className="text-red-300 text-[11px] mt-2">{e}</p>)}
        {c.error && <p className="text-red-300 text-[11px] mt-2">{c.error}</p>}
      </section>
      <div className="p-4 lg:p-3">
        <button onClick={c.download} disabled={bad || !c.mesh}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-3 lg:py-2 rounded-md bg-amber-500 text-slate-950 font-semibold disabled:opacity-40">
          <Download className="w-4 h-4" /> Download STL
        </button>
        {c.mesh && <p className="text-[10px] text-slate-500 mt-2">{c.triangleCount.toLocaleString()} triangles · {c.params.height} mm light source</p>}
      </div>
    </div>
  );
};
