import React, { useRef, useState } from 'react';
import { Download, RotateCcw, Upload, Play, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BUNDLED_IMAGES } from '../hooks/useTealightGenerator';
import type { ShadowWallController } from '../hooks/useShadowWallGenerator';
import { cornerRadiusLimits } from '../geometry/shadowWall/limits';

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="px-4 py-4 lg:py-3 border-b border-slate-800">
    <h3 className="text-[11px] lg:text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{title}</h3>
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
          className="w-20 lg:w-16 min-h-9 lg:min-h-0 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right text-base lg:text-xs text-slate-100"
        />
        {unit && <span className="text-slate-500 w-6">{unit}</span>}
      </span>
    </span>
    <input type="range" value={Math.min(max, Math.max(min, value))} min={min} max={max} step={step} disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value))} className="accent-amber-400 h-8 lg:h-auto" />
  </label>
);

const Check: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }> = ({ label, value, onChange, hint }) => (
  <label className="flex items-start gap-3 lg:gap-2 py-1 lg:py-0 text-slate-300 cursor-pointer">
    <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 lg:size-auto accent-amber-400" />
    <span>{label}{hint && <span className="block text-[10px] text-slate-500">{hint}</span>}</span>
  </label>
);

export const ShadowWallPanel: React.FC<{ c: ShadowWallController }> = ({ c }) => {
  const file = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const p = c.params;
  const bad = c.errors.length > 0;
  const ellipse = p.kind === 'ellipse';
  const radius = cornerRadiusLimits(p);
  const kindButton = (kind: 'rectangle' | 'ellipse', label: string) => (
    <button onClick={() => c.setParams({ kind })}
      className={`px-2 py-2.5 lg:py-1.5 rounded-md border text-center ${p.kind === kind ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-slate-700 hover:bg-slate-800'}`}>
      {label}
    </button>
  );

  return (
    <div className="w-full lg:h-full flex flex-col bg-slate-900 lg:overflow-y-auto custom-scrollbar select-none text-slate-300 text-sm lg:text-xs">
      <Group title="Image">
        <div className="grid grid-cols-3 gap-1.5">
          {BUNDLED_IMAGES.map((s) => (
            <button key={s.id} onClick={() => { setUploadError(null); c.selectSample(s.id); }}
              className={`px-2 py-2.5 lg:py-1.5 rounded-md border text-center ${c.sampleId === s.id ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-slate-700 hover:bg-slate-800'}`}>
              {s.name}
            </button>
          ))}
        </div>
        <button onClick={() => file.current?.click()} className="flex items-center justify-center gap-1.5 px-2 py-2.5 lg:py-1.5 rounded-md border border-slate-700 hover:bg-slate-800">
          <Upload className="w-3.5 h-3.5" /> Upload image{c.sampleId === 'upload' ? ` (${c.imageName})` : ''}
        </button>
        <input ref={file} type="file" accept="image/*,.svg" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setUploadError(null); c.upload(f).then(() => setUploadError(null)).catch((err: Error) => setUploadError(`Could not load that image: ${err.message}`)); }
            e.target.value = '';
          }} />
        {uploadError && <p className="text-red-300 text-[11px]">{uploadError}</p>}
        <Num label="Threshold" value={p.threshold} min={0} max={255} onChange={(v) => c.setParams({ threshold: v })} />
        <Num label="Edge Rounding" value={p.edgeRounding} min={0} max={40} onChange={(v) => c.setParams({ edgeRounding: v })} />
        <Check label="Invert" value={p.invert} onChange={(v) => c.setParams({ invert: v })} hint="Dark = shadow; turn on if the lit part should be the shape" />
      </Group>

      <Group title="Footprint">
        <div className="grid grid-cols-2 gap-1.5">
          {kindButton('rectangle', 'Rectangle')}
          {kindButton('ellipse', 'Ellipse')}
        </div>
        <Num label="Width" unit="mm" value={p.width} min={20} max={300} step={1} onChange={(v) => c.setParams({ width: v })} />
        <Num label="Length" unit="mm" value={p.length} min={20} max={300} step={1} onChange={(v) => c.setParams({ length: v })} />
        <Num label="Corner Radius" unit="mm" value={p.cornerRadius} min={radius.min} max={radius.max} step={0.5} disabled={ellipse} onChange={(v) => c.setParams({ cornerRadius: v })} />
      </Group>

      <Group title="Wall">
        <Num label="Wall Thickness" unit="mm" value={p.wallThickness} min={0.8} max={4} step={0.1} onChange={(v) => c.setParams({ wallThickness: v })} />
        <Num label="Height" unit="mm" value={p.height} min={20} max={Math.max(20, Math.min(200, p.lightHeight - 1))} onChange={(v) => c.setParams({ height: v })} />
        <Num label="Light Height" unit="mm" value={p.lightHeight} min={25} max={300} onChange={(v) => c.setParams({ lightHeight: v })} />
      </Group>

      <Group title="Shadow">
        <Num label="Shadow Size (width)" unit="mm" value={p.shadowSize} min={100} max={1000} step={10} onChange={(v) => c.setParams({ shadowSize: v })} />
        <Num label="Image Size in shadow" unit="%" value={p.imageScale} min={10} max={300} step={5} onChange={(v) => c.setParams({ imageScale: v })} />
        <Num label="Rotation" unit="°" value={p.rotation} min={-180} max={180} step={1} onChange={(v) => c.setParams({ rotation: v })} />
        <Num label="Image Offset X" unit="mm" value={p.offsetX} min={-p.shadowSize} max={p.shadowSize} step={1} onChange={(v) => c.setParams({ offsetX: v })} />
        <Num label="Image Offset Y" unit="mm" value={p.offsetY} min={-p.shadowSize} max={p.shadowSize} step={1} onChange={(v) => c.setParams({ offsetY: v })} />
      </Group>

      <Group title="Printability">
        <Num label="Minimum feature (0 = off)" unit="mm" value={p.minFeature} min={0} max={3} step={0.1} onChange={(v) => c.setParams({ minFeature: v })} />
      </Group>

      <div className="sticky bottom-0 z-10 mt-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-slate-950/95 backdrop-blur border-t border-slate-800 flex flex-col gap-2">
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
        <div className="flex gap-2 [&_button]:min-h-11 lg:[&_button]:min-h-0">
          <button onClick={c.reset} className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800"><RotateCcw className="w-3.5 h-3.5" />Reset</button>
          <button onClick={c.generate} disabled={bad || c.busy} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 disabled:opacity-40">
            <Play className="w-3.5 h-3.5" />{c.busy ? 'Generating…' : c.stale ? 'Regenerate 3D Model' : 'Generate 3D Model'}
          </button>
          <button onClick={c.download} disabled={!c.result || c.stale || bad || !c.result.check.watertight} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />STL
          </button>
        </div>
      </div>
    </div>
  );
};
