import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GrayImage,
  ImageAdjustments,
  LampConfig,
  LightConfig,
} from './types';
import { loadImageToGray } from './image/loadImage';
import { rgbaToGrayscale } from './image/grayscale';
import { ThreeViewport } from './components/ThreeViewport';
import { ShadowPreview } from './components/ShadowPreview';
import { ControlsPanel } from './components/ControlsPanel';
import defaultImageUrl from './assets/batman.jpg';
import { runGeneration, GenerationResult } from './workers/lampRunner';
import { downloadSTL } from './geometry/stl';
import { generateCircularMapSvg, generateUnwrappedMapSvg, downloadSVG } from './geometry/svg';
import { CheckCircle2, Download, Flame, HelpCircle } from 'lucide-react';
import { useTealightGenerator } from './hooks/useTealightGenerator';
import { TealightPanel } from './components/TealightPanel';
import { TealightViewport } from './components/TealightViewport';
import { Brand } from './components/Brand';
import { TableInset } from './components/TableInset';
import { GuidedApp } from './components/guided/GuidedApp';
import { WelcomeChoice } from './components/guided/WelcomeChoice';
import { readExperience, saveExperience, type Experience } from './ui/experience';
import { useBoxGenerator } from './hooks/useBoxGenerator';
import { BoxPanel } from './components/BoxPanel';
import { BoxViewport } from './components/BoxViewport';
import { useShadowWallGenerator } from './hooks/useShadowWallGenerator';
import { ShadowWallPanel } from './components/ShadowWallPanel';
import { useLightSourceGenerator } from './hooks/useLightSourceGenerator';
import { LightSourcePanel } from './components/LightSourcePanel';
import { previewHeights } from './geometry/shadowWall/shadowWall';

type AppMode = 'cylinder' | 'tealight' | 'bowl' | 'box' | 'wall' | 'light';
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

  // 1. Core States
  const [lamp, setLamp] = useState<LampConfig>({
    diameter: 80,
    height: 55,
    wallThickness: 1.2,
    minFeatureSize: 0.8,
    holeSize: 0.8,
    segmentsAround: 360,
    segmentsVertical: 124,
    topRimHeight: 4,
    bottomRimHeight: 6,
    hasBase: true,
    baseHeight: 8,
    ledCavityDiameter: 38,
    ledCavityDepth: 6,
    wireSlotWidth: 3.5,
    strutLength: 4, // 10% of radius (diameter / 2)
  });

  const [light, setLight] = useState<LightConfig>({
    position: { x: 0, y: 32, z: 0 },
    ledDiameter: 5,
    target: 'tabletop',
    tableRadius: 220,
    projectionDistance: 250,
    projectionWidth: 250,
    projectionHeight: 250,
    radialStruts: 36,
    strutThicknessRatio: 0.15,
    strutWidthColumns: 2,
    strutLength: 4, // 10% of radius (diameter / 2)
  });

  const [adjustments, setAdjustments] = useState<ImageAdjustments>({
    invert: false,
    brightness: 0,
    contrast: 1.1,
    gamma: 1.0,
    threshold: 0.5,
    rotation: 0,
    flipHorizontal: false,
    mode: 'halftone',
  });

  // Image source state
  const [activeImageSource, setActiveImageSource] = useState<File | 'default'>('default');
  const [grayImage, setGrayImage] = useState<GrayImage | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);


  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  // Geometry & simulation results
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);

  // Debounced light change tracker
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Loads the bundled default silhouette (Batman logo) as the initial/default image
  const loadDefaultImage = useCallback(async () => {
    const { grayImage: loaded, previewUrl } = await loadImageToGray(defaultImageUrl, {
      targetResolution: 512,
      adjustments,
    });
    setGrayImage(loaded);
    setSourcePreviewUrl(previewUrl);
    return loaded;
  }, [adjustments]);

  // Helper to load or regenerate the input GrayImage
  const processSourceImage = useCallback(async () => {
    if (activeImageSource === 'default') {
      return loadDefaultImage();
    } else if (activeImageSource instanceof File) {
      const { grayImage: loaded, previewUrl } = await loadImageToGray(activeImageSource, {
        targetResolution: 512,
        adjustments,
      });
      setGrayImage(loaded);
      setSourcePreviewUrl(previewUrl);
      return loaded;
    }
    return null;
  }, [activeImageSource, adjustments, loadDefaultImage]);

  // Main Generation Handler
  const handleGenerate = useCallback(async (customImg?: GrayImage) => {
    setIsGenerating(true);
    setProgressPercent(5);
    setProgressMessage('Preparing image and ray coordinates...');

    try {
      let currentImage = customImg || grayImage;
      if (!currentImage) {
        currentImage = await processSourceImage();
      }

      if (!currentImage) {
        throw new Error('No image loaded');
      }

      const result = await runGeneration(
        currentImage,
        lamp,
        light,
        {
          mode: adjustments.mode,
          threshold: adjustments.threshold,
          bayerSize: 4,
          preserveBridges: true,
        },
        (progress) => {
          setProgressPercent(progress.percent);
          setProgressMessage(progress.message);
        }
      );

      setGenerationResult(result);
      setProgressPercent(100);
      setProgressMessage('Complete!');
    } catch (err: any) {
      console.error('Lamp generation error:', err);
      setProgressMessage(err?.message || 'Generation error');
    } finally {
      setIsGenerating(false);
    }
  }, [grayImage, lamp, light, adjustments, processSourceImage]);

  // Initial load: only generate the cylinder lamp once its mode is first shown
  const cylinderStarted = useRef(false);
  useEffect(() => {
    if (appMode !== 'cylinder' || cylinderStarted.current) return;
    cylinderStarted.current = true;
    (async () => {
      const img = await processSourceImage();
      if (img) {
        handleGenerate(img);
      }
    })();
  }, [appMode]);

  // When source image or adjustments change, reprocess image
  const handleImageUpload = async (file: File) => {
    setActiveImageSource(file);
    const { grayImage: loaded, previewUrl } = await loadImageToGray(file, {
      targetResolution: 512,
      adjustments,
    });
    setGrayImage(loaded);
    setSourcePreviewUrl(previewUrl);
    handleGenerate(loaded);
  };

  // STL Export Trigger
  const handleExportSTL = () => {
    if (!generationResult?.stlBuffer) return;
    downloadSTL(generationResult.stlBuffer, `shadow-lamp-${lamp.diameter}x${lamp.height}mm.stl`);
  };

  // Circular Map SVG Export (Round Holes, No Square Holes)
  const handleExportCircularSVG = () => {
    if (!generationResult?.mask) return;
    const svg = generateCircularMapSvg(
      generationResult.mask,
      generationResult.gridWidth,
      generationResult.gridHeight,
      lamp,
      { style: 'circles' }
    );
    downloadSVG(svg, `shadow-lamp-circular-map-${lamp.diameter}mm-round-holes.svg`);
  };

  // Unwrapped Flat Stencil SVG Export
  const handleExportUnwrappedSVG = () => {
    if (!generationResult?.mask) return;
    const svg = generateUnwrappedMapSvg(
      generationResult.mask,
      generationResult.gridWidth,
      generationResult.gridHeight,
      lamp
    );
    downloadSVG(svg, `shadow-lamp-unwrapped-stencil-${lamp.diameter}x${lamp.height}mm.svg`);
  };

  if (GUIDED_ENABLED && experience === 'guided' && appMode === 'tealight') return <GuidedApp c={tea} onSwitch={() => choose('advanced')} />;

  return (
    <div className="flex flex-col lg:flex-row min-h-dvh w-full lg:h-dvh lg:w-screen bg-slate-950 text-slate-100 lg:overflow-hidden font-sans antialiased">
      {experience === null && <WelcomeChoice onChoose={choose} />}
      {/* Left Sidebar: brand + mode switch + controls */}
      <div className="order-2 lg:order-1 w-full lg:w-[380px] xl:w-[420px] lg:h-full shrink-0 flex flex-col z-20 shadow-2xl bg-slate-900">
        <Brand action={GUIDED_ENABLED && appMode === 'tealight' && (
          <button type="button" onClick={() => choose('guided')} className="min-h-9 px-2.5 py-1.5 rounded-md border border-slate-700 text-[11px] font-medium text-slate-300 hover:bg-slate-800">Guided steps</button>
        )} />
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
          {appMode === 'cylinder' ? (
          <ControlsPanel
            lamp={lamp}
            setLamp={setLamp}
            light={light}
            setLight={setLight}
            adjustments={adjustments}
            setAdjustments={setAdjustments}
            onImageUpload={handleImageUpload}
            onGenerate={() => handleGenerate()}
            onExportSTL={handleExportSTL}
            onExportCircularSVG={handleExportCircularSVG}
            onExportUnwrappedSVG={handleExportUnwrappedSVG}
            isGenerating={isGenerating}
            progressPercent={progressPercent}
            progressMessage={progressMessage}
            hasGeometry={Boolean(generationResult?.positions && generationResult.positions.length > 0)}
            triangleCount={generationResult?.triangleCount ?? 0}
          />
          ) : appMode === 'box' ? (
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
              busy={false}
              stale={false}
              onGenerate={() => {}}
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
              lightZ={wall.result?.lightZ ?? previewHeights(wall.params).lightZ}
              topZ={wall.result?.topZ ?? previewHeights(wall.params).topZ}
              groundRadius={wall.result?.groundRadius ?? (wall.params.shadowSize * wall.params.imageScale) / 200}
              triangleCount={wall.result?.triangleCount ?? 0}
              busy={wall.busy}
              stale={wall.stale}
              onGenerate={wall.generate}
            />
          </div>
        </div>
      ) : appMode !== 'cylinder' ? (
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
      ) : (
      <div className="flex-1 h-full flex flex-col overflow-y-auto custom-scrollbar p-4 lg:p-6 gap-5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Top: 3D Preview */}
        <div className="w-full h-[52vh] min-h-[380px] shrink-0">
          <ThreeViewport
            positions={generationResult?.positions ?? null}
            normals={generationResult?.normals ?? null}
            indices={generationResult?.indices ?? null}
            triangleCount={generationResult?.triangleCount ?? 0}
            lamp={lamp}
            light={light}
            simulatedShadow={generationResult?.simulatedShadow ?? null}
            isGenerating={isGenerating}
          />
        </div>

        {/* Bottom: Side-by-side Shadow Preview & Verification */}
        <div className="w-full shrink-0">
          <ShadowPreview
            sourceImage={grayImage}
            sourcePreviewUrl={sourcePreviewUrl}
            simulatedShadow={generationResult?.simulatedShadow ?? null}
            cylindricalMask={generationResult?.mask ?? null}
            gridWidth={generationResult?.gridWidth ?? lamp.segmentsAround}
            gridHeight={generationResult?.gridHeight ?? lamp.segmentsVertical}
            meanAbsoluteError={generationResult?.meanAbsoluteError ?? 0}
            similarityPercentage={generationResult?.similarityPercentage ?? 0}
            lamp={lamp}
            light={light}
            isGenerating={isGenerating}
          />

        </div>
      </div>
      )}
    </div>
  );
}

