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
import defaultShapeSvg from './assets/default-shape.svg?raw';
import { runGeneration, GenerationResult } from './workers/lampRunner';
import { downloadSTL } from './geometry/stl';
import { generateCircularMapSvg, generateUnwrappedMapSvg, downloadSVG } from './geometry/svg';
import { CheckCircle2, Download, Flame, HelpCircle } from 'lucide-react';

export default function App() {
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
    strutLength: 40,
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
    strutLength: 40,
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

  // Loads the bundled default silhouette (SVG) as the initial/default image
  const loadDefaultImage = useCallback(async () => {
    const { grayImage: loaded, previewUrl } = await loadImageToGray(defaultShapeSvg, {
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

  // Initial load
  useEffect(() => {
    (async () => {
      const img = await processSourceImage();
      if (img) {
        handleGenerate(img);
      }
    })();
  }, []);

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

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans antialiased">
      {/* Left Sidebar: Controls & Configuration */}
      <div className="w-[380px] xl:w-[420px] h-full shrink-0 flex flex-col z-20 shadow-2xl">
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
      </div>

      {/* Main Content Area: 3D Viewport & Optical Shadow Simulation */}
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
    </div>
  );
}

