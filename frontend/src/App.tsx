import React, { useState } from 'react';
import { useTealightGenerator } from './hooks/useTealightGenerator';
import { TealightPanel } from './components/TealightPanel';
import { TealightViewport } from './components/TealightViewport';
import { Brand } from './components/Brand';
import { TableInset } from './components/TableInset';
import { GuidedApp } from './components/guided/GuidedApp';
import { WelcomeChoice } from './components/guided/WelcomeChoice';
import { readExperience, saveExperience, type Experience } from './ui/experience';
import { AccountChip } from './auth/AccountChip';
import { useBoxGenerator } from './hooks/useBoxGenerator';
import { BoxPanel } from './components/BoxPanel';
import { BoxViewport } from './components/BoxViewport';
import { useShadowWallGenerator } from './hooks/useShadowWallGenerator';
import { ShadowWallPanel } from './components/ShadowWallPanel';
import { useLightSourceGenerator } from './hooks/useLightSourceGenerator';
import { LightSourcePanel } from './components/LightSourcePanel';

type AppMode = 'tealight' | 'bowl' | 'box' | 'wall' | 'light';
/** Guided steps UI and the welcome choice are switched off for now; set to true to bring them back. */
const GUIDED_ENABLED = false;

const MODES: { id: AppMode; label: string }[] = [
  { id: 'tealight', label: 'Tealight shade (table)' },
  { id: 'box', label: 'Box shadow (wall)' },
  { id: 'wall', label: 'Shadow wall (table)' },
  { id: 'light', label: 'Light source (bracket)' },
];

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('tealight');
  const tableMode = appMode === 'bowl' ? 'bowl' : 'tealight';
  const tea = useTealightGenerator(tableMode);
  const [experience, setExperience] = useState<Experience | null>(() => (GUIDED_ENABLED ? readExperience() : 'advanced'));
  const choose = (value: Experience) => { saveExperience(value); setExperience(value); };
  const box = useBoxGenerator(appMode === 'box');
  const wall = useShadowWallGenerator(appMode === 'wall');
  const light3d = useLightSourceGenerator(appMode === 'light');

  if (GUIDED_ENABLED && experience === 'guided' && appMode === 'tealight') return <GuidedApp c={tea} onSwitch={() => choose('advanced')} />;

  return (
    <div className="flex flex-col lg:flex-row min-h-dvh w-full lg:h-dvh lg:w-screen bg-slate-950 text-slate-100 lg:overflow-hidden font-sans antialiased">
      {experience === null && <WelcomeChoice onChoose={choose} />}
      {/* Left Sidebar: brand + mode switch + controls */}
      <div className="order-2 lg:order-1 w-full lg:w-[380px] xl:w-[420px] lg:h-full shrink-0 flex flex-col z-20 shadow-2xl bg-slate-900">
        <Brand action={<>
          {GUIDED_ENABLED && appMode === 'tealight' && (
            <button type="button" onClick={() => choose('guided')} className="min-h-9 px-2.5 py-1.5 rounded-md border border-slate-700 text-[11px] font-medium text-slate-300 hover:bg-slate-800">Guided steps</button>
          )}
          <AccountChip />
        </>} />
        {MODES.length > 1 && <div className="shrink-0 p-2 border-b border-slate-800 bg-slate-950/60 grid grid-cols-2 gap-1" role="tablist" aria-label="Lamp mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={appMode === m.id}
              onClick={() => setAppMode(m.id)}
              className={`px-1.5 py-1.5 rounded-md text-[11px] leading-tight font-medium transition-colors ${
                appMode === m.id ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40' : 'text-slate-400 border border-transparent hover:bg-slate-800'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>}
        <div className="flex-1 min-h-0 lg:[&>*]:h-full">
          {appMode === 'box' ? (
            <BoxPanel c={box} />
          ) : appMode === 'wall' ? (
            <ShadowWallPanel c={wall} />
          ) : appMode === 'light' ? (
            <LightSourcePanel c={light3d} />
          ) : (
            <TealightPanel c={tea} />
          )}
        </div>
      </div>

      {appMode === 'box' ? (
        <div className="max-lg:contents lg:order-2 lg:flex-1 lg:h-full flex flex-col overflow-y-auto lg:overflow-hidden custom-scrollbar lg:p-6 gap-5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <div className="order-1 sticky top-0 z-30 w-full h-[40dvh] min-h-[240px] p-2 bg-slate-950 lg:static lg:z-auto lg:p-0 lg:bg-transparent lg:flex-1 lg:min-h-[380px] shrink-0 lg:shrink">
            <BoxViewport
              preview={box.result?.preview ?? null}
              light={box.result?.light ?? null}
              shadowSize={box.params.shadowSize * (box.params.imageScale / 100)}
              busy={box.busy}
              stale={box.stale}
              onGenerate={box.generate}
            />
          </div>
        </div>
      ) : appMode === 'light' ? (
        <div className="max-lg:contents lg:order-2 lg:flex-1 lg:h-full flex flex-col overflow-y-auto lg:overflow-hidden custom-scrollbar lg:p-6 gap-5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <div className="order-1 sticky top-0 z-30 w-full h-[40dvh] min-h-[240px] p-2 bg-slate-950 lg:static lg:z-auto lg:p-0 lg:bg-transparent lg:flex-1 lg:min-h-[380px] shrink-0 lg:shrink">
            <TealightViewport
              positions={light3d.mesh?.positions ?? null}
              indices={light3d.mesh?.indices ?? null}
              lightZ={0}
              topZ={light3d.params.height}
              groundRadius={30}
              triangleCount={light3d.triangleCount}
              busy={light3d.busy}
              stale={light3d.stale}
              onGenerate={light3d.generate}
            />
          </div>
        </div>
      ) : appMode === 'wall' ? (
        <div className="max-lg:contents lg:order-2 lg:flex-1 lg:h-full flex flex-col overflow-y-auto lg:overflow-hidden custom-scrollbar lg:p-6 gap-5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <div className="order-1 sticky top-0 z-30 w-full h-[40dvh] min-h-[240px] p-2 bg-slate-950 lg:static lg:z-auto lg:p-0 lg:bg-transparent lg:flex-1 lg:min-h-[380px] shrink-0 lg:shrink">
            <TealightViewport
              positions={wall.result?.positions ?? null}
              indices={wall.result?.indices ?? null}
              supportFrom={wall.result?.supportIndexStart}
              lightZ={wall.result?.lightZ ?? wall.params.lightHeight + (wall.params.base ? wall.params.baseThickness : 0)}
              topZ={wall.result?.topZ ?? wall.params.height + (wall.params.base ? wall.params.baseThickness : 0)}
              groundRadius={wall.result?.groundRadius ?? (wall.params.shadowSize * wall.params.imageScale) / 200}
              triangleCount={wall.result?.triangleCount ?? 0}
              busy={wall.busy}
              stale={wall.stale}
              onGenerate={wall.generate}
            />
          </div>
        </div>
      ) : (
        <div className="max-lg:contents lg:order-2 lg:flex-1 lg:h-full flex flex-col overflow-y-auto lg:overflow-hidden custom-scrollbar lg:p-6 gap-5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <div className="order-1 sticky top-0 z-30 w-full h-[40dvh] min-h-[240px] p-2 bg-slate-950 lg:static lg:z-auto lg:p-0 lg:bg-transparent lg:flex-1 lg:min-h-[380px] shrink-0 lg:shrink">
            <TealightViewport
              positions={tea.result?.positions ?? null}
              indices={tea.result?.indices ?? null}
              lightZ={tea.result?.lightZ ?? 25}
              topZ={tea.result?.topZ ?? 60}
              groundRadius={tea.result?.groundRadius ?? 150}
              triangleCount={tea.result?.triangleCount ?? 0}
              busy={tea.busy}
              stale={tea.stale}
              onGenerate={tea.generate}
            />
          </div>
          {appMode === 'tealight' && <div className="order-3 p-3 lg:p-0 lg:shrink-0"><TableInset comparison={tea.result?.comparison ?? null} /></div>}
          {appMode === 'bowl' && (
            <p className="text-xs text-slate-400 px-1">
              The bowl has no holes: the rim height changes with angle so the rim&apos;s shadow edge follows the silhouette. Orbit the lit
              preview to see the shadow it throws on the ground plane.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

