import React, { useRef } from 'react';
import { Download, RotateCcw, Upload, Play, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { TealightController } from '../hooks/useTealightGenerator';
import { TEALIGHT_SAMPLES } from '../image/tealightSamples';

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="px-4 py-3 border-b border-slate-800">
    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{title}</h3>
    <div className="flex flex-col gap-2.5">{children}</div>
  </section>
);

const Num: React.FC<{
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; disabled?: boolean;
}> = ({ label, value, min, max, step = 1, unit, onChange, disabled }) => (
  <label className={`flex flex-col gap-1 ${disabled ? 'opacity-40' : ''}`}>
    <span className="flex justify-between text-slate-300">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number" value={value} min={min} max={max} step={step} disabled={disabled}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }}
          className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right text-slate-100"
        />
        {unit && <span className="text-slate-500 w-6">{unit}</span>}
      </span>
    </span>
    <input type="range" value={Math.min(max, Math.max(min, value))} min={min} max={max} step={step} disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value))} className="accent-amber-400" />
  </label>
);

const Check: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }> = ({ label, value, onChange, hint }) => (
  <label className="flex items-start gap-2 text-slate-300 cursor-pointer">
    <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-amber-400" />
    <span>{label}{hint && <span className="block text-[10px] text-slate-500">{hint}</span>}</span>
  </label>
);

export const TealightPanel: React.FC<{ c: TealightController }> = ({ c }) => {
  const file = useRef<HTMLInputElement>(null);
  const t = c.tParams, b = c.bParams;
  const isTea = c.mode === 'tealight';
  const pattern = isTea ? t : b;
  const setPattern = (patch: { threshold?: number; invert?: boolean }) => (isTea ? c.setTealight(patch) : c.setBowl(patch));
  const bad = c.errors.length > 0;

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 overflow-y-auto custom-scrollbar select-none text-slate-300 text-xs">
      <Group title="Image">
        <div className="grid grid-cols-3 gap-1.5">
          {TEALIGHT_SAMPLES.map((s) => (
            <button key={s.id} onClick={() => c.selectSample(s.id)}
              className={`px-2 py-1.5 rounded-md border text-center ${c.sampleId === s.id ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-slate-700 hover:bg-slate-800'}`}>
              {s.name}
            </button>
          ))}
        </div>
        <button onClick={() => file.current?.click()} className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-slate-700 hover:bg-slate-800">
          <Upload className="w-3.5 h-3.5" /> Upload image{c.sampleId === 'upload' ? ` (${c.imageName})` : ''}
        </button>
        <input ref={file} type="file" accept="image/*,.svg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) c.upload(f); e.target.value = ''; }} />
        <p className="text-[10px] text-slate-500">
          {isTea ? 'Black = light passes (hole), white = solid. Image is the shadow seen from above, centred under the shade.'
                 : 'Dark region = the silhouette the rim shadow will trace.'}
        </p>
      </Group>

      <Group title="Pattern">
        <Num label="Threshold" value={pattern.threshold} min={0} max={255} onChange={(v) => setPattern({ threshold: v })} />
        {isTea && <Num label="Edge Rounding" value={t.edgeRounding} min={0} max={40} onChange={(v) => c.setTealight({ edgeRounding: v })} />}
        <Check label="Invert" value={pattern.invert} onChange={(v) => setPattern({ invert: v })} />
      </Group>

      {isTea ? (
        <>
          <Group title="Shade">
            <Num label="Inner Diameter (bottom)" unit="mm" value={t.innerDiameter} min={44} max={120} step={0.5} onChange={(v) => c.setTealight({ innerDiameter: v })} />
            <Num label="Top Diameter" unit="mm" value={t.topDiameter} min={20} max={120} step={0.5} onChange={(v) => c.setTealight({ topDiameter: v })} />
            <Num label="Height" unit="mm" value={t.height} min={30} max={150} onChange={(v) => c.setTealight({ height: v })} />
            <Num label="Wall Thickness" unit="mm" value={t.wallThickness} min={0.8} max={4} step={0.1} onChange={(v) => c.setTealight({ wallThickness: v })} />
            <Num label="Resolution (cols)" value={t.cols} min={120} max={720} step={20} onChange={(v) => c.setTealight({ cols: v })} />
            <Num label="Flame Height" unit="mm" value={t.flameHeight} min={8} max={100} disabled={t.useLed} onChange={(v) => c.setTealight({ flameHeight: v })} />
            <Num label="Shadow Radius" unit="mm" value={t.shadowRadius} min={60} max={400} onChange={(v) => c.setTealight({ shadowRadius: v })} />
            <Num label="Support Ribs" value={t.ribs} min={0} max={24} onChange={(v) => c.setTealight({ ribs: v })} />
            <Num label="Rib Width" unit="mm" value={t.ribWidth} min={0.8} max={6} step={0.2} disabled={t.ribs === 0} onChange={(v) => c.setTealight({ ribWidth: v })} />
            <Num label="Base Vents" value={t.vents} min={0} max={16} onChange={(v) => c.setTealight({ vents: v })} />
            <Num label="Vent Size" unit="mm" value={t.ventSize} min={3} max={16} step={0.5} disabled={t.vents === 0} onChange={(v) => c.setTealight({ ventSize: v })} />
          </Group>
          <Group title="Printability">
            <Check label="Auto-bridge floating islands" value={t.autoBridge} onChange={(v) => c.setTealight({ autoBridge: v })}
              hint="Adds thin strips so the middle of an “O” stays attached." />
            <Num label="Minimum feature (0 = off)" unit="mm" value={t.minFeature} min={0} max={3} step={0.1} onChange={(v) => c.setTealight({ minFeature: v })} />
          </Group>
          <Group title="LED tealight">
            <Check label="Use LED tealight" value={t.useLed} onChange={(v) => c.setTealight({ useLed: v })} hint="Hangs upside down from the top rim; flame height is derived." />
            <Num label="Tealight Diameter" unit="mm" value={t.tealightDiameter} min={30} max={60} step={0.5} onChange={(v) => c.setTealight({ tealightDiameter: v })} />
            <Num label="Body Height" unit="mm" value={t.bodyHeight} min={8} max={30} disabled={!t.useLed} onChange={(v) => c.setTealight({ bodyHeight: v })} />
            <Num label="LED Tip Height" unit="mm" value={t.ledTipHeight} min={2} max={30} disabled={!t.useLed} onChange={(v) => c.setTealight({ ledTipHeight: v })} />
          </Group>
        </>
      ) : (
        <Group title="Bowl">
          <Num label="Bowl Diameter (inner)" unit="mm" value={b.bowlDiameter} min={50} max={160} onChange={(v) => c.setBowl({ bowlDiameter: v })} />
          <Num label="LED Height" unit="mm" value={b.ledHeight} min={15} max={80} onChange={(v) => c.setBowl({ ledHeight: v })} />
          <Num label="Minimum Rim" unit="mm" value={b.minRim} min={2} max={30} onChange={(v) => c.setBowl({ minRim: v })} />
          <Num label="Wall Thickness" unit="mm" value={b.wallThickness} min={1} max={5} step={0.2} onChange={(v) => c.setBowl({ wallThickness: v })} />
          <Num label="Base Thickness" unit="mm" value={b.baseThickness} min={1} max={6} step={0.2} onChange={(v) => c.setBowl({ baseThickness: v })} />
          <Num label="Shadow Radius" unit="mm" value={b.shadowRadius} min={60} max={400} onChange={(v) => c.setBowl({ shadowRadius: v })} />
          <Num label="Resolution (steps)" value={b.steps} min={180} max={1440} step={60} onChange={(v) => c.setBowl({ steps: v })} />
          <Num label="Rim Smoothing" value={b.rimSmoothing} min={0} max={12} step={0.5} onChange={(v) => c.setBowl({ rimSmoothing: v })} />
          <Num label="Tealight Diameter" unit="mm" value={b.tealightDiameter} min={30} max={60} step={0.5} onChange={(v) => c.setBowl({ tealightDiameter: v })} />
          <Num label="Tealight Body Height" unit="mm" value={b.bodyHeight} min={8} max={30} onChange={(v) => c.setBowl({ bodyHeight: v })} />
          <p className="flex gap-1.5 text-amber-300/90 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Only star-shaped silhouettes (one radius per angle) are reproduced; concave detail is lost. LED tealight only.
          </p>
        </Group>
      )}

      <Group title="Tips">
        <ul className="list-disc pl-4 text-[11px] text-slate-400 space-y-1">
          <li>Raise resolution to keep fine detail.</li>
          <li>Use base vents with real flames.</li>
          <li>Print in PETG or use an LED tealight: PLA softens around 60 °C.</li>
        </ul>
      </Group>

      <div className="sticky bottom-0 mt-auto p-3 bg-slate-950/90 backdrop-blur border-t border-slate-800 flex flex-col gap-2">
        {c.errors.map((e) => (
          <p key={e} className="flex gap-1.5 text-red-300 text-[11px]"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{e}</p>
        ))}
        {c.runError && <p className="text-red-300 text-[11px]">{c.runError}</p>}
        {c.result && !bad && (
          <p className={`flex gap-1.5 text-[11px] ${c.result.check.watertight && c.result.check.errors.length === 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {c.result.check.watertight && c.result.check.errors.length === 0
              ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />watertight ✓ · {c.result.triangleCount.toLocaleString()} triangles · {Math.round(c.result.ms)} ms</>
              : <><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />not watertight: {c.result.check.errors.join(' ')}</>}
          </p>
        )}
        {!bad && c.result?.warnings.map((w) => <p key={w} className="text-amber-300/90 text-[11px]">⚠ {w}</p>)}
        <div className="flex gap-2">
          <button onClick={c.reset} className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800"><RotateCcw className="w-3.5 h-3.5" />Reset</button>
          <button onClick={c.generate} disabled={bad || c.busy} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 disabled:opacity-40">
            <Play className="w-3.5 h-3.5" />{c.busy ? 'Generating…' : 'Generate 3D Model'}
          </button>
          <button onClick={c.download} disabled={!c.result || bad || !c.result.check.watertight} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />STL
          </button>
        </div>
      </div>
    </div>
  );
};
