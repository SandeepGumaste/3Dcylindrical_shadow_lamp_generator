import React, { useRef } from 'react';
import { Download, Upload, Play, AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import type { BoxController } from '../hooks/useBoxGenerator';
import { KIT_UI as KIT } from '../contracts/box';

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="px-4 py-4 lg:py-3 border-b border-slate-800">
    <h3 className="text-[11px] lg:text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{title}</h3>
    <div className="flex flex-col gap-2.5">{children}</div>
  </section>
);

const Num: React.FC<{
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, unit, onChange }) => (
  <label className="flex flex-col gap-1">
    <span className="flex justify-between text-slate-300">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number" value={value} min={min} max={max} step={step}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }}
          className="w-20 lg:w-16 min-h-9 lg:min-h-0 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right text-base lg:text-xs text-slate-100"
        />
        {unit && <span className="text-slate-500 w-6">{unit}</span>}
      </span>
    </span>
    <input type="range" value={Math.min(max, Math.max(min, value))} min={min} max={max} step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))} className="accent-amber-400 h-8 lg:h-auto" />
  </label>
);

const Check: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }> = ({ label, value, onChange, hint }) => (
  <label className="flex items-start gap-3 lg:gap-2 py-1 lg:py-0 text-slate-300 cursor-pointer">
    <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 lg:size-auto accent-amber-400" />
    <span>{label}{hint && <span className="block text-[10px] text-slate-500">{hint}</span>}</span>
  </label>
);

const Picker: React.FC<{ label: string; name: string; onFile: (f: File) => void }> = ({ label, name, onFile }) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button onClick={() => input.current?.click()} className="flex items-center justify-center gap-1.5 px-2 py-2.5 lg:py-1.5 rounded-md border border-slate-700 hover:bg-slate-800">
        <Upload className="w-3.5 h-3.5" /> {label}{name ? ` (${name})` : ''}
      </button>
      <input ref={input} type="file" accept="image/*,.svg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </>
  );
};

export const BoxPanel: React.FC<{ c: BoxController }> = ({ c }) => {
  const p = c.params;
  const bad = c.errors.length > 0;
  const [lo, hi] = KIT.lightHeightRange;
  return (
    <div className="w-full lg:h-full flex flex-col bg-slate-900 lg:overflow-y-auto custom-scrollbar select-none text-slate-300 text-sm lg:text-xs">
      <Group title="Shadow image">
        <Picker label="Upload shadow image" name={c.shadowName} onFile={c.selectShadow} />
        <p className="text-[10px] text-slate-500">Dark = shadow on the wall. With Inner details on, lit areas inside the shape become openings in the walls; with it off, only the outline is reproduced.</p>
        <Num label="Threshold" value={p.threshold} min={0} max={255} onChange={(v) => c.setParams({ threshold: v })} />
        <Num label="Edge rounding" value={p.edgeRounding} min={0} max={40} onChange={(v) => c.setParams({ edgeRounding: v })} />
        <Check label="Invert" value={p.invert} onChange={(v) => c.setParams({ invert: v })} />
        <Check label="Inner details" value={p.innerDetails} onChange={(v) => c.setParams({ innerDetails: v })}
          hint="Cuts openings in the walls so lit areas inside the shape show. Thin strokes are thickened and floating pieces joined with small bridges." />
        <Num label="Shadow size (width on the wall)" unit="mm" value={p.shadowSize} min={150} max={3000} step={25} onChange={(v) => c.setParams({ shadowSize: v })} />
        <button onClick={c.fitShadow} disabled={bad}
          title="Enlarges the shadow just enough that every part of the shape is bigger than the smallest shadow the box itself casts"
          className="w-full px-2 py-2 lg:py-1.5 rounded-md border border-slate-700 hover:bg-slate-800 disabled:opacity-40 text-slate-200">
          Fit shadow to the box
        </button>
        {c.fitNote && <p className="text-[10px] text-amber-300">{c.fitNote}</p>}
        <Num label="Image size in shadow" unit="%" value={p.imageScale} min={20} max={300} step={5} onChange={(v) => c.setParams({ imageScale: v })} />
        <Num label="Light height above the panel" unit="mm" value={p.lightHeight} min={lo} max={hi} step={1} onChange={(v) => c.setParams({ lightHeight: v })} />
      </Group>

      <Group title="Panel picture">
        <Picker label="Upload panel picture" name={c.panelName} onFile={c.selectPanel} />
        <p className="text-[10px] text-slate-500">Dark tones become the raised, black layers. Change filament at the top of the 3 mm plate.</p>
        <Num label="Threshold" value={p.panelThreshold} min={0} max={255} onChange={(v) => c.setParams({ panelThreshold: v })} />
        <Check label="Invert" value={p.panelInvert} onChange={(v) => c.setParams({ panelInvert: v })} />
      </Group>

      <Group title="Tray">
        <div className="grid grid-cols-2 gap-1.5">
          {(['2AA', '2AAA'] as const).map((t) => (
            <button key={t} onClick={() => c.setParams({ tray: t })}
              className={`px-2 py-2.5 lg:py-1.5 rounded-md border text-center ${p.tray === t ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-slate-700 hover:bg-slate-800'}`}>
              2×{t.slice(1)} batteries
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">Box size is fixed at {KIT.boxW} × {KIT.boxD} mm.</p>
      </Group>

      <Group title="Printability">
        <Num label="Minimum spike width" unit="mm" value={p.minSpike} min={0.4} max={4} step={0.1} onChange={(v) => c.setParams({ minSpike: v })} />
        <Num label="Minimum notch width" unit="mm" value={p.minGap} min={0.4} max={3} step={0.1} onChange={(v) => c.setParams({ minGap: v })} />
      </Group>

      {c.result && (
        <Group title="Kit parts">
          <ul className="flex flex-col gap-1">
            {c.result.parts.map((part) => (
              <li key={part.id} className="flex items-center justify-between gap-2">
                <span>{part.label}{part.generated ? '' : <span className="text-slate-500"> · fixed</span>}</span>
                <button onClick={() => c.downloadPart(part.id)} disabled={c.stale} className="flex items-center gap-1 px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-40">
                  <Download className="w-3 h-3" />STL
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}

      <div className="sticky bottom-0 z-10 mt-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-slate-950/95 backdrop-blur border-t border-slate-800 flex flex-col gap-2">
        {c.errors.map((e) => (
          <p key={e} className="flex gap-1.5 text-red-300 text-[11px]"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{e}</p>
        ))}
        {c.error && <p className="text-red-300 text-[11px]">{c.error}</p>}
        {c.result && !bad && (
          <p className="flex gap-1.5 text-[11px] text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />{c.result.parts.length} parts ready · {Math.round(c.result.ms)} ms</p>
        )}
        {!bad && c.result?.warnings.map((w) => <p key={w} className="text-amber-300/90 text-[11px]">⚠ {w}</p>)}
        <div className="flex gap-2 [&_button]:min-h-11 lg:[&_button]:min-h-0">
          <button onClick={c.generate} disabled={bad || c.busy} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 disabled:opacity-40">
            <Play className="w-3.5 h-3.5" />{c.busy ? 'Generating…' : c.stale ? 'Regenerate 3D model' : 'Generate 3D model'}
          </button>
          <button onClick={c.downloadKit} disabled={!c.result || c.stale || bad}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40">
            <Package className="w-3.5 h-3.5" />Kit (zip)
          </button>
        </div>
      </div>
    </div>
  );
};
