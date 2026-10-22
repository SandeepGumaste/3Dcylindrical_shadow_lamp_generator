import React, { useEffect, useRef, useState } from 'react';
import { BUNDLED_IMAGES } from '../../hooks/useTealightGenerator';
import type { TealightController } from '../../hooks/useTealightGenerator';
import type { ShadowComparison } from '../../contracts/outputs';
import { TealightViewport } from '../TealightViewport';
import { GUIDED_STEPS, applyChange, isOff, rangeLimits, type Item, type RangeItem } from '../../ui/guidedSteps';
import { readGuidedTheme, saveGuidedTheme, type GuidedTheme } from '../../ui/experience';
import './guided.css';

const systemTheme = (): GuidedTheme => (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/** The Guided steps view of Tealight shade mode: the same controller as the advanced panel, one step at a time. */
export const GuidedApp: React.FC<{ c: TealightController; onSwitch: () => void; startStep?: number }> = ({ c, onSwitch, startStep = 0 }) => {
  const [step, setStep] = useState(startStep);
  const [theme, setTheme] = useState<GuidedTheme>(() => readGuidedTheme() ?? systemTheme());
  const fileInput = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const t = c.tParams;
  const rs = t.autoRibs ? c.result?.ribSuggestion : undefined;
  const ribs = rs ? rs.ribs : t.ribs;
  const bad = c.errors.length > 0;
  const current = GUIDED_STEPS[step];
  const last = step === GUIDED_STEPS.length - 1;

  const go = (i: number) => { moved.current = true; setStep(i); };
  // After a step change, bring the new step's heading into view (below the pinned preview on a phone) and give it focus.
  useEffect(() => {
    if (!moved.current) return;
    cardRef.current?.scrollTo?.({ top: 0 });
    cardRef.current?.scrollIntoView?.({ block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);
  const toggleTheme = () => { const next: GuidedTheme = theme === 'dark' ? 'light' : 'dark'; setTheme(next); saveGuidedTheme(next); };
  const change = (key: Parameters<typeof applyChange>[0], value: number | boolean) => c.setTealight(applyChange(key, value, t, ribs));

  const ribHint = rs
    ? rs.achievable
      ? rs.ribs > 0
        ? `Using ${rs.ribs} evenly spaced ribs for this pattern (widest unsupported hole was ${Number.isFinite(rs.spanWithoutRibs) ? rs.spanWithoutRibs.toFixed(0) + ' mm' : 'a full ring'}; now all within ${t.maxBridge} mm or steep).`
        : 'This pattern needs no ribs for printing.'
      : `${rs.ribs} ribs is the most allowed and still leaves a ${rs.worstSpan.toFixed(1)} mm flat-roofed hole.`
    : 'Looks at the generated pattern and picks an even number of evenly spaced ribs. Editing the rib count turns this off.';

  const renderItem = (item: Item, index: number) => {
    if (item.kind === 'images') {
      return (
        <div key={`images-${index}`}>
          <div className="seg" role="group" aria-label="Image">
            {BUNDLED_IMAGES.map((b) => (
              <button key={b.id} type="button" aria-pressed={c.sampleId === b.id} onClick={() => c.selectSample(b.id)}>
                <img src={b.url} alt="" /><span className="name">{b.name}</span>
              </button>
            ))}
            <button type="button" aria-pressed={c.sampleId === 'upload'} onClick={() => fileInput.current?.click()}>
              <span className="up" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg></span>
              <span className="name">{c.sampleId === 'upload' ? c.imageName : 'Upload'}</span>
            </button>
          </div>
          <input ref={fileInput} type="file" accept="image/*,.svg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) c.upload(f); e.target.value = ''; }} />
          <p className="note">Black = light passes (hole), white = solid. The image is the shadow seen from above, centred under the shade.</p>
        </div>
      );
    }
    const off = isOff(item.key, t, ribs);
    if (item.kind === 'check') {
      const hint = item.hint === 'ribs' ? ribHint : item.help;
      return (
        <label key={item.key} className={`chk${off ? ' off' : ''}`}>
          <input type="checkbox" checked={t[item.key]} disabled={off} onChange={(e) => change(item.key, e.target.checked)} />
          <span>{item.label}</span>
          {hint && <small>{hint}</small>}
        </label>
      );
    }
    const [min, max] = rangeLimits(item as RangeItem, t);
    const value = item.key === 'ribs' ? ribs : t[item.key];
    const id = `g-${item.key}`;
    return (
      <div key={item.key} className={`row${off ? ' off' : ''}`}>
        <label htmlFor={id}>{item.label}</label>
        <span>
          <input id={id} type="number" value={value} min={min} max={max} step={item.step} disabled={off}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) change(item.key, v); }} />
          {item.unit && <span className="u">{item.unit}</span>}
        </span>
        <input type="range" aria-label={item.label} value={Math.min(max, Math.max(min, value))} min={min} max={max} step={item.step} disabled={off}
          onChange={(e) => change(item.key, parseFloat(e.target.value))} />
        {item.help && <span className="help">{item.help}</span>}
      </div>
    );
  };

  const result = c.result;
  const watertight = !!result && result.check.watertight && result.check.errors.length === 0;

  return (
    <div className="guided-shell" data-theme={theme}>
      <div className="guided">
        <header className="hd">
          <div className="brand">
            <svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0f172a" /><path d="M22 10h20l8 26H14z" fill="#fbbf24" /><ellipse cx="30" cy="47" rx="9" ry="3.2" fill="#f59e0b" opacity=".35" /><ellipse cx="38" cy="50" rx="17" ry="5.2" fill="#f59e0b" opacity=".6" /></svg>
            Odd Shadows
          </div>
          <span className="sp" />
          <button type="button" className="ibtn" onClick={onSwitch} title="Show every setting at once"><span className="long">Advanced view</span><span className="short">Advanced</span></button>
          <button type="button" className="ibtn" onClick={toggleTheme} aria-label="Switch between light and dark mode">
            <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            <span className="label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </header>

        <nav className="steps" aria-label="Steps">
          {GUIDED_STEPS.map((s, i) => (
            <button key={s.id} type="button" className={`st${i === step ? ' now' : i < step ? ' done' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}>
              <i>{i < step ? '✓' : i + 1}</i><div>{s.title}<small>{s.sub}</small></div>
            </button>
          ))}
        </nav>

        <div className="body">
          <section className="view" aria-label="Model preview">
            <TealightViewport
              positions={result?.positions ?? null}
              indices={result?.indices ?? null}
              lightZ={result?.lightZ ?? 25}
              topZ={result?.topZ ?? 60}
              groundRadius={result?.groundRadius ?? 150}
              triangleCount={result?.triangleCount ?? 0}
              busy={c.busy}
              stale={c.stale}
              onGenerate={c.generate}
            />
          </section>

          <section className="card" ref={cardRef}>
            <h2 ref={headingRef} tabIndex={-1}>{current.title}</h2>
            <p className="sub">{current.intro}</p>

            {current.groups.map((g, gi) => (
              <div className="group" key={gi}>
                {g.title && <h3>{g.title}</h3>}
                {g.sub && <p className="gsub">{g.sub}</p>}
                {g.items.map(renderItem)}
              </div>
            ))}

            {current.export && (
              <>
                {!result
                  ? <div className="note">Nothing generated yet.</div>
                  : bad
                    ? null
                    : watertight
                      ? <div className="stat ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></svg><span>Watertight · {result.triangleCount.toLocaleString()} triangles · {Math.round(result.ms)} ms{c.stale ? ' (previous model)' : ''}</span></div>
                      : <div className="stat bad"><span>Not watertight: {result.check.errors.join(' ')}</span></div>}
                {c.stale && <div className="note">Settings changed since the model in the preview was generated. Generate again to update it and to turn the downloads back on.</div>}
                {!bad && result && result.warnings.length > 0 && <ul className="warns">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                <button type="button" className={`big${c.busy ? ' busy' : ''}`} onClick={c.generate} disabled={bad || c.busy}>{c.busy ? 'Generating…' : c.stale ? 'Regenerate 3D model' : 'Generate 3D model'}</button>
                <div className="exports">
                  <button type="button" onClick={c.download} disabled={!result || c.stale || bad || !result.check.watertight}>Download STL</button>
                  <button type="button" onClick={c.downloadMap} disabled={!result?.hasMap || c.stale || bad} title="Unwrapped wall map (mm), solid = black, holes = white">Download SVG map</button>
                </div>
                <ShadowCheck comparison={result?.comparison ?? null} />
                <ul className="tips">
                  <li>Raise the resolution to keep fine detail.</li>
                  <li>Use base vents with a real flame.</li>
                  <li>Print in PETG or use an LED tealight: PLA softens around 60 °C.</li>
                </ul>
                <button type="button" className="linkbtn" onClick={c.reset}>Reset all settings</button>
              </>
            )}

            <div className="foot">
              {(bad || c.runError) && (
                <ul className="errors" role="alert">
                  {c.errors.map((e) => <li key={e}>{e}</li>)}
                  {c.runError && <li>{c.runError}</li>}
                </ul>
              )}
              <div className="nav">
                <button type="button" className="back" onClick={() => go(step - 1)} disabled={step === 0}>Back</button>
                {last
                  ? <button type="button" className="next" onClick={c.generate} disabled={bad || c.busy || (!!result && !c.stale)}>{c.busy ? 'Generating…' : c.stale ? 'Regenerate 3D model' : !result ? 'Generate 3D model' : 'Generated'}</button>
                  : <button type="button" className="next" onClick={() => go(step + 1)}>Next: {GUIDED_STEPS[step + 1].title.toLowerCase()}</button>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

/** The forward-projected table shadow next to the thresholded input, collapsed until opened. */
const ShadowCheck: React.FC<{ comparison: ShadowComparison | null }> = ({ comparison }) => {
  const [open, setOpen] = useState(false);
  const refs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  useEffect(() => {
    if (!comparison || !open) return;
    const { size, projected, target, valid } = comparison;
    const draw = (cv: HTMLCanvasElement | null, px: (i: number) => [number, number, number]) => {
      if (!cv) return;
      cv.width = size; cv.height = size;
      const ctx = cv.getContext('2d')!;
      const img = ctx.createImageData(size, size);
      for (let i = 0; i < size * size; i++) {
        const [r, g, b] = px(i);
        img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    };
    const lit: [number, number, number] = [255, 214, 140], dark: [number, number, number] = [18, 20, 28];
    draw(refs[0].current, (i) => (target[i] ? lit : dark));
    draw(refs[1].current, (i) => (projected[i] ? lit : dark));
    draw(refs[2].current, (i) => {
      if (!valid[i]) return [40, 44, 56];
      if (projected[i] === target[i]) return [30, 60, 40];
      return projected[i] ? [90, 160, 255] : [255, 90, 90]; // blue: extra light, red: missing light
    });
  }, [comparison, open]);
  return (
    <details className="check" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><b>Table shadow check</b><span>{comparison ? `IoU ${(comparison.iou * 100).toFixed(1)}% (ribs excluded)` : 'no data'}</span></summary>
      <div className="panes">
        <figure><canvas ref={refs[0]} />input</figure>
        <figure><canvas ref={refs[1]} />projected</figure>
        <figure><canvas ref={refs[2]} />difference</figure>
      </div>
    </details>
  );
};
