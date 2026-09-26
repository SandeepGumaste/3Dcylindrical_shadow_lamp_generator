import React, { useRef, useState } from 'react';
import {
  LampConfig,
  LightConfig,
  ImageAdjustments,
  Preset,
} from '../types';
import {
  Upload,
  RefreshCw,
  Sun,
  Sliders,
  Layers,
  Download,
  RotateCw,
  FlipHorizontal,
  Info,
  Sparkles,
  Check,
  Flame,
  FileImage,
  Disc,
  FileCode,
  ChevronDown,
} from 'lucide-react';

interface ControlsPanelProps {
  lamp: LampConfig;
  setLamp: React.Dispatch<React.SetStateAction<LampConfig>>;
  light: LightConfig;
  setLight: React.Dispatch<React.SetStateAction<LightConfig>>;
  adjustments: ImageAdjustments;
  setAdjustments: React.Dispatch<React.SetStateAction<ImageAdjustments>>;
  onImageUpload: (file: File) => void;
  onSelectSample: (type: 'dragon' | 'wolf' | 'celestial' | 'circle' | 'mandala' | 'stripes') => void;
  onGenerate: () => void;
  onExportSTL: () => void;
  onExportCircularSVG: () => void;
  onExportUnwrappedSVG: () => void;
  isGenerating: boolean;
  progressPercent: number;
  progressMessage: string;
  hasGeometry: boolean;
  triangleCount: number;
}

export const PRESETS: Preset[] = [
  {
    id: 'dragon_tabletop',
    name: 'Dragon (Photo Match)',
    description: '360° Tabletop Radial Silhouette with Struts (Photo Match)',
    lamp: { diameter: 80, height: 55, wallThickness: 1.2, segmentsAround: 360, segmentsVertical: 124, hasBase: true, ledCavityDiameter: 38, strutLength: 40 },
    light: { target: 'tabletop', position: { x: 0, y: 32, z: 0 }, tableRadius: 220, radialStruts: 36, strutWidthColumns: 2, strutLength: 40 },
    resolution: 512,
  },
  {
    id: 'celestial_tabletop',
    name: 'Celestial Moon & Stars',
    description: 'Moon, sun, and cosmic stars on tabletop',
    lamp: { diameter: 85, height: 55, wallThickness: 1.2, segmentsAround: 360, segmentsVertical: 116, hasBase: true, ledCavityDiameter: 38, strutLength: 42.5 },
    light: { target: 'tabletop', position: { x: 0, y: 32, z: 0 }, tableRadius: 230, radialStruts: 32, strutWidthColumns: 2, strutLength: 42.5 },
    resolution: 512,
  },
  {
    id: 'portrait_wall',
    name: 'Portrait (Wall Screen)',
    description: '90 × 100 mm, vertical projection screen',
    lamp: { diameter: 90, height: 100, wallThickness: 1.2, segmentsAround: 300, segmentsVertical: 167 },
    light: { target: 'vertical_wall', position: { x: 0, y: 45, z: 0 }, projectionDistance: 250, radialStruts: 0 },
    resolution: 512,
  },
];


export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  lamp,
  setLamp,
  light,
  setLight,
  adjustments,
  setAdjustments,
  onImageUpload,
  onSelectSample,
  onGenerate,
  onExportSTL,
  onExportCircularSVG,
  onExportUnwrappedSVG,
  isGenerating,
  progressPercent,
  progressMessage,
  hasGeometry,
  triangleCount,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onImageUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const applyPreset = (preset: Preset) => {
    setLamp((prev) => ({ ...prev, ...preset.lamp }));
    if (preset.light.position) {
      setLight((prev) => ({
        ...prev,
        ...preset.light,
        position: { ...prev.position, ...preset.light.position },
      }));
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 border-r border-slate-800 overflow-y-auto custom-scrollbar select-none text-slate-300 text-xs">
      {/* App Branding & Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40 sticky top-0 z-30 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Flame className="w-4 h-4 fill-amber-400/20" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100 tracking-tight">Shadow Lamp</h1>
            <p className="text-[10px] text-slate-500">Inverse Ray Solver & STL/SVG</p>
          </div>
        </div>

        {/* Export Action Menu */}
        <div className="relative">
          <div className="flex items-center gap-1">
            <button
              onClick={onExportSTL}
              disabled={!hasGeometry || isGenerating}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg font-medium transition-all ${
                hasGeometry && !isGenerating
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
              title="Export 3D printable STL"
            >
              <Download className="w-3.5 h-3.5" />
              <span>STL</span>
            </button>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!hasGeometry || isGenerating}
              className={`px-1.5 py-1.5 rounded-r-lg font-medium border-l border-amber-600/30 transition-all ${
                hasGeometry && !isGenerating
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
              title="More export options (SVG Circular Map, Unwrapped Stencil)"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Export Dropdown */}
          {showExportMenu && (
            <div
              className="absolute right-0 top-full mt-1.5 w-52 bg-slate-950 border border-slate-700/80 rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-1 text-slate-200"
              onMouseLeave={() => setShowExportMenu(false)}
            >
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                Vector & 3D Exports
              </div>
              <button
                onClick={() => {
                  onExportCircularSVG();
                  setShowExportMenu(false);
                }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-amber-500/15 hover:text-amber-300 text-xs transition-colors"
              >
                <Disc className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-slate-100">Circular Map (SVG)</span>
                  <span className="text-[10px] text-slate-400">Polar projection disc</span>
                </div>
              </button>

              <button
                onClick={() => {
                  onExportUnwrappedSVG();
                  setShowExportMenu(false);
                }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-slate-800 text-xs transition-colors"
              >
                <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-slate-100">Unwrapped Stencil (SVG)</span>
                  <span className="text-[10px] text-slate-400">Flat laser cut template</span>
                </div>
              </button>

              <button
                onClick={() => {
                  onExportSTL();
                  setShowExportMenu(false);
                }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-slate-800 text-xs transition-colors border-t border-slate-800"
              >
                <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-slate-100">3D Model (Binary STL)</span>
                  <span className="text-[10px] text-slate-400">Watertight FDM printable</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>


      <div className="p-4 flex flex-col gap-5">
        {/* Preset Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Presets
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {PRESETS.map((p) => {
              const isSelected =
                lamp.diameter === p.lamp.diameter && lamp.height === p.lamp.height;
              return (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className={`p-2 rounded-lg border text-left flex flex-col transition-colors ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                      : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <span className="font-medium text-[11px] truncate">{p.name.split(' ')[0]}</span>
                  <span className="text-[10px] text-slate-500">
                    {p.lamp.diameter}×{p.lamp.height}mm
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. Image Upload & Quick Samples */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              Source Image / Shadow
            </label>
            <span className="text-[10px] text-amber-400 font-mono font-medium bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              SVG / Vector
            </span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".svg, image/svg+xml, image/png, image/jpeg, image/webp"
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-3.5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all text-center group ${
              isDragging
                ? 'border-amber-400 bg-amber-500/15 scale-[1.01]'
                : 'border-slate-700 hover:border-amber-400/60 bg-slate-950/40 hover:bg-slate-950/80'
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-slate-800 group-hover:bg-amber-500/20 text-slate-400 group-hover:text-amber-400 flex items-center justify-center transition-colors shadow-inner">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-slate-200 group-hover:text-amber-300 transition-colors flex items-center justify-center gap-1.5">
                <span>Upload Target Shadow</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 text-[9px] font-mono font-semibold border border-amber-500/40">
                  .SVG
                </span>
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Drop your <strong className="text-amber-300 font-mono font-semibold">.svg</strong> vector file here or click to browse
              </p>
              <p className="text-[9px] text-slate-500 mt-0.5 font-mono">
                SVG vector, PNG, JPG, or WebP
              </p>
            </div>
          </div>

          {/* Quick Synthetic Test Samples */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-slate-500">Or use test pattern:</span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={() => onSelectSample('dragon')}
                className="px-2 py-0.5 rounded bg-amber-500/25 text-amber-300 font-medium hover:bg-amber-500/35 border border-amber-500/40 text-[10px] flex items-center gap-1 shadow-sm"
                title="Dragon silhouette with radial shadow rays matching reference photo"
              >
                <span>🐉 Dragon (Photo)</span>
              </button>
              <button
                onClick={() => onSelectSample('wolf')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1"
                title="Howling wolf on cliff"
              >
                <span>🐺 Wolf</span>
              </button>
              <button
                onClick={() => onSelectSample('celestial')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1"
                title="Sun, moon, and stars"
              >
                <span>🌙 Celestial</span>
              </button>
              <button
                onClick={() => onSelectSample('mandala')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
              >
                Mandala
              </button>
            </div>

          </div>
        </div>

        {/* 2. Image Processing Controls */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              Image Adjustments
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setAdjustments((prev) => ({
                    ...prev,
                    rotation: (prev.rotation + 90) % 360,
                  }))
                }
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                title="Rotate 90°"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  setAdjustments((prev) => ({
                    ...prev,
                    flipHorizontal: !prev.flipHorizontal,
                  }))
                }
                className={`p-1 rounded transition-colors ${
                  adjustments.flipHorizontal
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'hover:bg-slate-800 text-slate-400'
                }`}
                title="Mirror Horizontal"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 bg-slate-950/50 p-3 rounded-xl border border-slate-800/70">
            {/* Invert */}
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Invert Colors (Dark/Light)</span>
              <button
                onClick={() =>
                  setAdjustments((prev) => ({ ...prev, invert: !prev.invert }))
                }
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  adjustments.invert
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {adjustments.invert ? 'Inverted' : 'Standard'}
              </button>
            </div>

            {/* Brightness */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Brightness</span>
                <span className="font-mono text-slate-300">
                  {adjustments.brightness > 0 ? `+${adjustments.brightness}` : adjustments.brightness}
                </span>
              </div>
              <input
                type="range"
                min="-0.8"
                max="0.8"
                step="0.05"
                value={adjustments.brightness}
                onChange={(e) =>
                  setAdjustments((prev) => ({
                    ...prev,
                    brightness: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Contrast */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Contrast</span>
                <span className="font-mono text-slate-300">{adjustments.contrast.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.3"
                max="2.5"
                step="0.1"
                value={adjustments.contrast}
                onChange={(e) =>
                  setAdjustments((prev) => ({
                    ...prev,
                    contrast: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Mode: Halftone vs Binary */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span className="text-slate-400">Perforation Mode</span>
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                <button
                  onClick={() =>
                    setAdjustments((prev) => ({ ...prev, mode: 'halftone' }))
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    adjustments.mode === 'halftone'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Halftone
                </button>
                <button
                  onClick={() =>
                    setAdjustments((prev) => ({ ...prev, mode: 'binary' }))
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    adjustments.mode === 'binary'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Binary
                </button>
              </div>
            </div>

            {/* Threshold */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Hole Threshold</span>
                <span className="font-mono text-slate-300">{adjustments.threshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={adjustments.threshold}
                onChange={(e) =>
                  setAdjustments((prev) => ({
                    ...prev,
                    threshold: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 3. Lamp Dimensions */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-800/80">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            Lamp Physical Dimensions
          </label>

          <div className="grid grid-cols-2 gap-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800/70">
            {/* Diameter */}
            <div className="flex flex-col gap-1">
              <span className="text-slate-400">Diameter (mm)</span>
              <input
                type="number"
                min="40"
                max="220"
                step="5"
                value={lamp.diameter}
                onChange={(e) =>
                  setLamp((prev) => ({ ...prev, diameter: Math.max(40, parseInt(e.target.value) || 40) }))
                }
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-mono focus:border-amber-400 outline-none"
              />
            </div>

            {/* Height */}
            <div className="flex flex-col gap-1">
              <span className="text-slate-400">Height (mm)</span>
              <input
                type="number"
                min="40"
                max="250"
                step="5"
                value={lamp.height}
                onChange={(e) =>
                  setLamp((prev) => ({ ...prev, height: Math.max(40, parseInt(e.target.value) || 40) }))
                }
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-mono focus:border-amber-400 outline-none"
              />
            </div>

            {/* Wall Thickness */}
            <div className="flex flex-col gap-1">
              <span className="text-slate-400">Wall Thick. (mm)</span>
              <input
                type="number"
                min="0.8"
                max="3.0"
                step="0.2"
                value={lamp.wallThickness}
                onChange={(e) =>
                  setLamp((prev) => ({
                    ...prev,
                    wallThickness: Math.max(0.8, parseFloat(e.target.value) || 0.8),
                  }))
                }
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-mono focus:border-amber-400 outline-none"
              />
            </div>

            {/* Angular Resolution (Segments) */}
            <div className="flex flex-col gap-1">
              <span className="text-slate-400">Perforation Grid</span>
              <select
                value={lamp.segmentsAround}
                onChange={(e) => {
                  const segs = parseInt(e.target.value);
                  setLamp((prev) => ({
                    ...prev,
                    segmentsAround: segs,
                    segmentsVertical: Math.round(segs * (prev.height / prev.diameter) * 0.5),
                  }));
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100 font-mono text-[11px] focus:border-amber-400 outline-none"
              >
                <option value={180}>180 (Fast)</option>
                <option value={240}>240 (Balanced)</option>
                <option value={320}>320 (Sharp)</option>
                <option value={360}>360 (Fine)</option>
                <option value={480}>480 (Ultra)</option>
              </select>
            </div>

            {/* Base Toggle */}
            <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span className="text-slate-300">Mounting Base & LED Cavity</span>
              <button
                onClick={() => setLamp((prev) => ({ ...prev, hasBase: !prev.hasBase }))}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  lamp.hasBase
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {lamp.hasBase ? 'Enabled (38mm Tea Light)' : 'Hollow Shell'}
              </button>
            </div>
          </div>
        </div>

        {/* 4. Light Source Config */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-800/80">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            Virtual LED & Projection Target
          </label>

          <div className="space-y-2.5 bg-slate-950/50 p-3 rounded-xl border border-slate-800/70">
            {/* Projection Mode Switch */}
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/60">
              <span className="text-slate-300">Target Surface</span>
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                <button
                  onClick={() =>
                    setLight((prev) => ({
                      ...prev,
                      target: 'tabletop',
                      radialStruts: prev.radialStruts || 36,
                    }))
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    light.target === 'tabletop'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  360° Table (Photo)
                </button>
                <button
                  onClick={() => setLight((prev) => ({ ...prev, target: 'vertical_wall' }))}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    light.target === 'vertical_wall'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Vertical Wall
                </button>
              </div>
            </div>

            {/* LED Height (Y) */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">LED Height (Y)</span>
                <span className="font-mono text-slate-300">{light.position.y} mm</span>
              </div>
              <input
                type="range"
                min="10"
                max={lamp.height - 10}
                step="1"
                value={light.position.y}
                onChange={(e) =>
                  setLight((prev) => ({
                    ...prev,
                    position: { ...prev.position, y: parseInt(e.target.value) },
                  }))
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {light.target === 'tabletop' ? (
              <>
                {/* Tabletop Shadow Radius */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Tabletop Shadow Radius</span>
                    <span className="font-mono text-slate-300">{light.tableRadius || 220} mm</span>
                  </div>
                  <input
                    type="range"
                    min="120"
                    max="450"
                    step="10"
                    value={light.tableRadius || 220}
                    onChange={(e) =>
                      setLight((prev) => ({
                        ...prev,
                        tableRadius: parseInt(e.target.value),
                      }))
                    }
                    className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Radial Structural Ribs */}
                <div className="flex flex-col gap-1 pt-1 border-t border-slate-800/60">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300">Radial Structural Ribs (Struts)</span>
                    <span className="font-mono text-amber-300 font-medium">{light.radialStruts} spokes</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="64"
                    step="4"
                    value={light.radialStruts}
                    onChange={(e) =>
                      setLight((prev) => ({
                        ...prev,
                        radialStruts: parseInt(e.target.value),
                      }))
                    }
                    className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 leading-snug">
                    Connects floating islands (wings, head) and casts the radial sunbeam lines seen in the photo.
                  </span>

                  {/* Strut Width Configuration */}
                  <div
                    className={`flex flex-col gap-1.5 pt-1.5 mt-0.5 border-t border-slate-800/40 transition-opacity ${
                      light.radialStruts === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'
                    }`}
                  >
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-300 font-medium">Strut Width (Rib Thickness)</span>
                      <span className="font-mono text-amber-300 font-medium">
                        {light.strutWidthColumns ?? 2} {((light.strutWidthColumns ?? 2) === 1 ? 'col' : 'cols')}
                        <span className="text-slate-400 font-normal ml-1">
                          (~{(((light.strutWidthColumns ?? 2) * (Math.PI * lamp.diameter)) / lamp.segmentsAround).toFixed(1)} mm)
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="1"
                        max="8"
                        step="1"
                        value={light.strutWidthColumns ?? 2}
                        disabled={light.radialStruts === 0}
                        onChange={(e) =>
                          setLight((prev) => ({
                            ...prev,
                            strutWidthColumns: parseInt(e.target.value),
                          }))
                        }
                        className="flex-1 accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:cursor-not-allowed"
                      />

                      {/* Stepper buttons */}
                      <div className="flex items-center bg-slate-900 rounded border border-slate-800">
                        <button
                          type="button"
                          disabled={light.radialStruts === 0 || (light.strutWidthColumns ?? 2) <= 1}
                          onClick={() =>
                            setLight((prev) => ({
                              ...prev,
                              strutWidthColumns: Math.max(1, (prev.strutWidthColumns ?? 2) - 1),
                            }))
                          }
                          className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                          title="Decrease strut width by 1 column"
                        >
                          -
                        </button>
                        <span className="px-1.5 text-[11px] font-mono text-amber-400 select-none min-w-[16px] text-center">
                          {light.strutWidthColumns ?? 2}
                        </span>
                        <button
                          type="button"
                          disabled={light.radialStruts === 0 || (light.strutWidthColumns ?? 2) >= 8}
                          onClick={() =>
                            setLight((prev) => ({
                              ...prev,
                              strutWidthColumns: Math.min(8, (prev.strutWidthColumns ?? 2) + 1),
                            }))
                          }
                          className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                          title="Increase strut width by 1 column"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Quick preset chips */}
                    <div className="grid grid-cols-4 gap-1 pt-0.5">
                      {[
                        { label: 'Fine (1)', val: 1, desc: 'Subtle shadow' },
                        { label: 'Medium (2)', val: 2, desc: 'Photo match' },
                        { label: 'Bold (3)', val: 3, desc: 'Extra rigid' },
                        { label: 'Heavy (4)', val: 4, desc: 'Heavy duty' },
                      ].map((preset) => {
                        const active = (light.strutWidthColumns ?? 2) === preset.val;
                        return (
                          <button
                            key={preset.val}
                            type="button"
                            disabled={light.radialStruts === 0}
                            onClick={() => setLight((prev) => ({ ...prev, strutWidthColumns: preset.val }))}
                            className={`py-1 px-1 rounded text-[10px] text-center transition-colors border ${
                              active
                                ? 'bg-amber-500/20 text-amber-300 font-medium border-amber-500/40 shadow-sm shadow-amber-500/10'
                                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                            }`}
                            title={`${preset.desc} (~${((preset.val * (Math.PI * lamp.diameter)) / lamp.segmentsAround).toFixed(1)} mm)`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    {light.radialStruts === 0 ? (
                      <span className="text-[10px] text-slate-500 italic">
                        Enable spokes (&gt; 0) above to apply structural struts.
                      </span>
                    ) : (
                      <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
                        <span>
                          Spacing: ~{Math.floor(lamp.segmentsAround / Math.max(1, light.radialStruts))} cols (~{(((Math.PI * lamp.diameter) / Math.max(1, light.radialStruts))).toFixed(1)} mm apart)
                        </span>
                        <span>
                          {light.radialStruts} struts × {light.strutWidthColumns ?? 2} cols
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Strut Length (Extend Toward Center) */}
                  <div
                    className={`flex flex-col gap-1.5 pt-1.5 mt-0.5 border-t border-slate-800/40 transition-opacity ${
                      light.radialStruts === 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'
                    }`}
                  >
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-300 font-medium">Strut Length (Extend Toward Center)</span>
                      <span className="font-mono text-amber-300 font-medium">
                        {(light.strutLength ?? Math.round(lamp.diameter / 2)).toFixed(0)} mm
                        <span className="text-slate-400 font-normal ml-1">
                          ({Math.round(((light.strutLength ?? Math.round(lamp.diameter / 2)) / (lamp.diameter / 2)) * 100)}%)
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={Math.max(2, Math.round(lamp.diameter * 0.1))}
                        max={Math.round(lamp.diameter / 2)}
                        step="1"
                        value={light.strutLength ?? Math.round(lamp.diameter / 2)}
                        disabled={light.radialStruts === 0}
                        onChange={(e) =>
                          setLight((prev) => ({
                            ...prev,
                            strutLength: parseInt(e.target.value),
                          }))
                        }
                        className="flex-1 accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:cursor-not-allowed"
                      />

                      {/* Stepper buttons */}
                      <div className="flex items-center bg-slate-900 rounded border border-slate-800">
                        <button
                          type="button"
                          disabled={
                            light.radialStruts === 0 ||
                            (light.strutLength ?? Math.round(lamp.diameter / 2)) <= Math.max(2, Math.round(lamp.diameter * 0.1))
                          }
                          onClick={() =>
                            setLight((prev) => ({
                              ...prev,
                              strutLength: Math.max(
                                Math.max(2, Math.round(lamp.diameter * 0.1)),
                                (prev.strutLength ?? Math.round(lamp.diameter / 2)) - 2
                              ),
                            }))
                          }
                          className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                          title="Decrease strut reach toward center"
                        >
                          -
                        </button>
                        <span className="px-1.5 text-[11px] font-mono text-amber-400 select-none min-w-[24px] text-center">
                          {Math.round(light.strutLength ?? (lamp.diameter / 2))}
                        </span>
                        <button
                          type="button"
                          disabled={
                            light.radialStruts === 0 ||
                            (light.strutLength ?? Math.round(lamp.diameter / 2)) >= Math.round(lamp.diameter / 2)
                          }
                          onClick={() =>
                            setLight((prev) => ({
                              ...prev,
                              strutLength: Math.min(
                                Math.round(lamp.diameter / 2),
                                (prev.strutLength ?? Math.round(lamp.diameter / 2)) + 2
                              ),
                            }))
                          }
                          className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                          title="Increase strut reach toward center"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Quick preset chips for length */}
                    <div className="grid grid-cols-4 gap-1 pt-0.5">
                      {[
                        { label: '25% (Edge)', fraction: 0.25 },
                        { label: '50% (Half)', fraction: 0.5 },
                        { label: '75% (Deep)', fraction: 0.75 },
                        { label: '100% (Center)', fraction: 1.0 },
                      ].map((preset) => {
                        const targetLen = Math.round((lamp.diameter / 2) * preset.fraction);
                        const currentVal = Math.round(light.strutLength ?? (lamp.diameter / 2));
                        const active = Math.abs(currentVal - targetLen) <= 1;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            disabled={light.radialStruts === 0}
                            onClick={() => setLight((prev) => ({ ...prev, strutLength: targetLen }))}
                            className={`py-1 px-1 rounded text-[10px] text-center transition-colors border ${
                              active
                                ? 'bg-amber-500/20 text-amber-300 font-medium border-amber-500/40 shadow-sm shadow-amber-500/10'
                                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                            }`}
                            title={`Extend struts ${targetLen} mm toward center (${Math.round(preset.fraction * 100)}%)`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <span className="text-[10px] text-slate-500 leading-snug">
                      Inward depth of the entire vertical struts extending from the cylinder wall towards the central LED cavity / table axis.
                    </span>
                  </div>
                </div>
              </>
            ) : (
              /* Projection Distance for Wall */
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Wall Distance (Z)</span>
                  <span className="font-mono text-slate-300">{light.projectionDistance} mm</span>
                </div>
                <input
                  type="range"
                  min="150"
                  max="600"
                  step="10"
                  value={light.projectionDistance}
                  onChange={(e) =>
                    setLight((prev) => ({
                      ...prev,
                      projectionDistance: parseInt(e.target.value),
                      projectionWidth: parseInt(e.target.value),
                      projectionHeight: parseInt(e.target.value),
                    }))
                  }
                  className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>


        {/* Generate Button & Progress */}
        <div className="pt-2">
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              isGenerating
                ? 'bg-amber-500/40 text-amber-200 cursor-wait'
                : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-lg shadow-amber-500/25 active:scale-[0.98]'
            }`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{progressMessage || 'Computing Geometry...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Lamp Geometry</span>
              </>
            )}
          </button>

          {isGenerating && (
            <div className="w-full mt-2 bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-amber-400 h-full transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}

          {/* Physical Disclaimer */}
          <div className="mt-3 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[10px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>
              <strong>Physical 3D Printing Note:</strong> For best results, use a small point-like
              LED source positioned near ({light.position.x}, {light.position.y}, {light.position.z}) mm.
              The model produces a closed, watertight manifold with solid rims.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
