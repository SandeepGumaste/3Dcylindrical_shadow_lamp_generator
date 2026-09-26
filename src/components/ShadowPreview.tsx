import React, { useEffect, useRef, useState } from 'react';
import { GrayImage, LampConfig, LightConfig } from '../types';
import { CheckCircle2, Info, Download, Disc } from 'lucide-react';
import { generateCircularMapSvg, generateUnwrappedMapSvg, downloadSVG, getRowSpans } from '../geometry/svg';

interface ShadowPreviewProps {
  sourceImage: GrayImage | null;
  sourcePreviewUrl: string | null;
  simulatedShadow: GrayImage | null;
  cylindricalMask: Uint8Array | null;
  gridWidth: number;
  gridHeight: number;
  meanAbsoluteError: number;
  similarityPercentage: number;
  lamp: LampConfig;
  light: LightConfig;
  isGenerating?: boolean;
}

export const ShadowPreview: React.FC<ShadowPreviewProps> = ({
  sourceImage,
  sourcePreviewUrl,
  simulatedShadow,
  cylindricalMask,
  gridWidth,
  gridHeight,
  meanAbsoluteError,
  similarityPercentage,
  lamp,
  light,
  isGenerating = false,
}) => {
  const simCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const circularCanvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTab, setActiveTab] = useState<'comparison' | 'circularMap' | 'cylinderMask'>('comparison');
  const [circularHoleStyle, setCircularHoleStyle] = useState<'sharp-edges' | 'circles' | 'smooth-arcs'>('sharp-edges');

  // Render simulated shadow to canvas
  useEffect(() => {
    const canvas = simCanvasRef.current;
    if (!canvas || !simulatedShadow) return;

    const { width, height, pixels } = simulatedShadow;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const isTabletop = light.target === 'tabletop';
    const lampRadius = lamp.diameter / 2;
    const tableRadius = light.tableRadius || 220;

    for (let py = 0; py < height; py++) {
      const v = (py + 0.5) / height;
      const z = (v - 0.5) * 2 * tableRadius;

      for (let px = 0; px < width; px++) {
        const u = (px + 0.5) / width;
        const x = (u - 0.5) * 2 * tableRadius;
        const r = Math.sqrt(x * x + z * z);
        const idx = py * width + px;
        const pIdx = idx * 4;

        if (isTabletop && r > tableRadius) {
          data[pIdx] = 10;
          data[pIdx + 1] = 12;
          data[pIdx + 2] = 18;
          data[pIdx + 3] = 255;
          continue;
        }

        const val = Math.max(0, Math.min(1, pixels[idx]));
        if (isTabletop) {
          if (r <= lampRadius) {
            data[pIdx] = 8;
            data[pIdx + 1] = 9;
            data[pIdx + 2] = 14;
            data[pIdx + 3] = 255;
            continue;
          }

          const distNorm = (r - lampRadius) / (tableRadius * 0.4);
          const falloff = 1 / (1 + Math.pow(Math.max(0, distNorm), 1.15));

          if (val > 0.02) {
            const level = val * falloff;
            data[pIdx] = Math.round(255 * (0.35 + 0.65 * level));
            data[pIdx + 1] = Math.round(195 * (0.2 + 0.8 * level));
            data[pIdx + 2] = Math.round(85 * (0.1 + 0.9 * level));
            data[pIdx + 3] = 255;
          } else {
            // Dark silhouette shadow
            data[pIdx] = 12;
            data[pIdx + 1] = 14;
            data[pIdx + 2] = 20;
            data[pIdx + 3] = 255;
          }
        } else {
          data[pIdx] = Math.round(255 * val);
          data[pIdx + 1] = Math.round(230 * val);
          data[pIdx + 2] = Math.round(175 * val);
          data[pIdx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [simulatedShadow]);

  // Render cylindrical unwrapped mask to canvas
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !cylindricalMask || gridWidth === 0 || gridHeight === 0) return;

    canvas.width = gridWidth;
    canvas.height = gridHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(gridWidth, gridHeight);
    const data = imgData.data;

    for (let row = 0; row < gridHeight; row++) {
      const canvasRow = gridHeight - 1 - row;
      for (let col = 0; col < gridWidth; col++) {
        const maskIdx = row * gridWidth + col;
        const canvasIdx = canvasRow * gridWidth + col;
        const isOpen = cylindricalMask[maskIdx] === 1;

        const r = isOpen ? 250 : 20;
        const g = isOpen ? 204 : 24;
        const b = isOpen ? 21 : 33;

        data[canvasIdx * 4] = r;
        data[canvasIdx * 4 + 1] = g;
        data[canvasIdx * 4 + 2] = b;
        data[canvasIdx * 4 + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [cylindricalMask, gridWidth, gridHeight]);

  // Render circular polar map to canvas
  useEffect(() => {
    const canvas = circularCanvasRef.current;
    if (!canvas || !cylindricalMask || gridWidth === 0 || gridHeight === 0) return;

    const size = 500;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size * 0.44;
    const innerR = lamp.hasBase ? outerR * 0.35 : outerR * 0.2;

    const dTheta = (2 * Math.PI) / gridWidth;
    const dr = (outerR - innerR) / gridHeight;

    // Draw background disk
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
    ctx.fillStyle = '#111827';
    ctx.fill();

    if (circularHoleStyle === 'sharp-edges') {
      // Draw continuous polygonal spans with SHARP FLAT EDGES (no squares on edges)
      ctx.fillStyle = '#f59e0b';
      const allSpans = [];
      for (let r = 0; r < gridHeight; r++) {
        allSpans.push(getRowSpans(cylindricalMask, r, gridWidth));
      }

      for (let row = 0; row < gridHeight; row++) {
        const r0 = innerR + row * dr;
        const r1 = r0 + dr;
        const currentSpans = allSpans[row];
        const prevSpans = row > 0 ? allSpans[row - 1] : [];
        const nextSpans = row < gridHeight - 1 ? allSpans[row + 1] : [];

        for (const span of currentSpans) {
          let prev = null;
          for (const s of prevSpans) {
            if (Math.max(s.start, span.start) <= Math.min(s.end, span.end)) {
              prev = s;
              break;
            }
          }
          let next = null;
          for (const s of nextSpans) {
            if (Math.max(s.start, span.start) <= Math.min(s.end, span.end)) {
              next = s;
              break;
            }
          }

          const cInStart = prev ? 0.5 * (span.start + prev.start) : span.start;
          const cOutStart = next ? 0.5 * (span.start + next.start) : span.start;
          const cInEnd = prev ? 0.5 * (span.end + 1 + prev.end + 1) : span.end + 1;
          const cOutEnd = next ? 0.5 * (span.end + 1 + next.end + 1) : span.end + 1;

          const thInStart = (cInStart / gridWidth) * 2 * Math.PI - Math.PI;
          const thOutStart = (cOutStart / gridWidth) * 2 * Math.PI - Math.PI;
          const thOutEnd = (cOutEnd / gridWidth) * 2 * Math.PI - Math.PI;
          const thInEnd = (cInEnd / gridWidth) * 2 * Math.PI - Math.PI;

          const x0 = cx + r0 * Math.cos(thInStart);
          const y0 = cy + r0 * Math.sin(thInStart);
          const x1 = cx + r1 * Math.cos(thOutStart);
          const y1 = cy + r1 * Math.sin(thOutStart);
          const x3 = cx + r0 * Math.cos(thInEnd);
          const y3 = cy + r0 * Math.sin(thInEnd);

          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.arc(cx, cy, r1, thOutStart, thOutEnd, false);
          ctx.lineTo(x3, y3);
          ctx.arc(cx, cy, r0, thInEnd, thInStart, true);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (circularHoleStyle === 'circles') {
      // Draw smooth round circular holes (drilled pinholes)
      ctx.fillStyle = '#f59e0b';
      for (let row = 0; row < gridHeight; row++) {
        const r = innerR + (row + 0.5) * dr;
        const arcWidth = r * dTheta;
        const holeR = Math.max(0.6, Math.min(dr, arcWidth) * 0.45 * (lamp.holeSize ?? 0.85));

        for (let col = 0; col < gridWidth; col++) {
          const idx = row * gridWidth + col;
          if (cylindricalMask[idx] !== 1) continue;

          const theta = (col + 0.5) * dTheta - Math.PI;
          const x = cx + r * Math.cos(theta);
          const y = cy + r * Math.sin(theta);

          ctx.beginPath();
          ctx.arc(x, y, holeR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // Draw continuous smooth curved ribbons with rounded caps
      ctx.strokeStyle = '#f59e0b';
      ctx.lineCap = 'round';

      for (let row = 0; row < gridHeight; row++) {
        const rCenter = innerR + (row + 0.5) * dr;
        const strokeW = Math.max(1, dr * 0.9 * (lamp.holeSize ?? 0.85));
        ctx.lineWidth = strokeW;

        let startCol: number | null = null;
        for (let col = 0; col <= gridWidth; col++) {
          const isOpen = col < gridWidth && cylindricalMask[row * gridWidth + col] === 1;

          if (isOpen && startCol === null) {
            startCol = col;
          } else if (!isOpen && startCol !== null) {
            const endCol = col - 1;
            const th0 = (startCol + 0.5) * dTheta - Math.PI;
            const th1 = (endCol + 0.5) * dTheta - Math.PI;

            if (startCol === endCol) {
              const x = cx + rCenter * Math.cos(th0);
              const y = cy + rCenter * Math.sin(th0);
              ctx.beginPath();
              ctx.arc(x, y, strokeW * 0.5, 0, Math.PI * 2);
              ctx.fillStyle = '#f59e0b';
              ctx.fill();
            } else {
              ctx.beginPath();
              ctx.arc(cx, cy, rCenter, th0, th1, false);
              ctx.stroke();
            }

            startCol = null;
          }
        }
      }
    }

    // Cut line guides: Center hole
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.fillStyle = '#090d16';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#3b82f6';
    ctx.setLineDash([4, 4]);
    ctx.stroke();

    // Outer boundary
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ef4444';
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosshairs
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - outerR - 10, cy);
    ctx.lineTo(cx + outerR + 10, cy);
    ctx.moveTo(cx, cy - outerR - 10);
    ctx.lineTo(cx, cy + outerR + 10);
    ctx.stroke();
  }, [cylindricalMask, gridWidth, gridHeight, lamp, circularHoleStyle]);

  const handleDownloadCircularSvg = () => {
    if (!cylindricalMask) return;
    const svg = generateCircularMapSvg(cylindricalMask, gridWidth, gridHeight, lamp, {
      style: circularHoleStyle,
    });
    downloadSVG(svg, `shadow-lamp-circular-map-${lamp.diameter}mm-${circularHoleStyle}.svg`);
  };

  const handleDownloadUnwrappedSvg = () => {
    if (!cylindricalMask) return;
    const svg = generateUnwrappedMapSvg(cylindricalMask, gridWidth, gridHeight, lamp);
    downloadSVG(svg, `shadow-lamp-unwrapped-stencil-${lamp.diameter}x${lamp.height}mm.svg`);
  };

  return (
    <div className="w-full bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-xl flex flex-col gap-3">
      {/* Header and Mode Selector */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Optical & 2D Vector Maps
          </span>
          {similarityPercentage > 0 && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-mono font-medium flex items-center gap-1 ${
                similarityPercentage > 75
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              Shadow Similarity: {similarityPercentage}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('comparison')}
            className={`px-2.5 py-1 rounded transition-colors ${
              activeTab === 'comparison'
                ? 'bg-slate-800 text-slate-100 font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Source vs Simulated
          </button>
          <button
            onClick={() => setActiveTab('circularMap')}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
              activeTab === 'circularMap'
                ? 'bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Disc className="w-3 h-3 text-amber-400" />
            Circular Map (SVG)
          </button>
          <button
            onClick={() => setActiveTab('cylinderMask')}
            className={`px-2.5 py-1 rounded transition-colors ${
              activeTab === 'cylinderMask'
                ? 'bg-slate-800 text-slate-100 font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cylinder UV Mask
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {activeTab === 'comparison' && (
        <div className="flex flex-col gap-3">
          {/* Side by Side Views */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original Input Image */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-300">1. Target Silhouette (Input)</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {light.target === 'tabletop' ? `360° Tabletop (${light.tableRadius || 220} mm)` : 'Projection Screen'}
                </span>
              </div>
              <div className="aspect-square w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center relative shadow-inner">
                {sourcePreviewUrl ? (
                  <img
                    src={sourcePreviewUrl}
                    alt="Source input"
                    className="w-full h-full object-contain filter contrast-125"
                  />
                ) : (
                  <div className="text-xs text-slate-600 font-mono text-center p-4">
                    Upload an image or select a preset to preview
                  </div>
                )}
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-900/80 backdrop-blur-sm text-[10px] text-slate-400 border border-slate-700/50">
                  {light.target === 'tabletop' ? 'Target Tabletop Silhouette' : 'Target Screen Image'}
                </div>
              </div>
            </div>

            {/* Simulated Projected Shadow */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-amber-300">2. Simulated Shadow (Like Photo)</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {light.target === 'tabletop' ? `${light.radialStruts} Radial Struts` : 'Raycast through Mask'}
                </span>
              </div>
              <div className="aspect-square w-full rounded-lg bg-black border border-slate-800 overflow-hidden flex items-center justify-center relative shadow-inner">
                <canvas
                  ref={simCanvasRef}
                  className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(251,191,36,0.15)]"
                />
                {!simulatedShadow && !isGenerating && (
                  <div className="absolute text-xs text-slate-600 font-mono text-center p-4">
                    Click "Generate Lamp" to simulate optical shadow
                  </div>
                )}
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-amber-950/80 backdrop-blur-sm text-[10px] text-amber-300 border border-amber-800/50">
                  {light.target === 'tabletop' ? 'Simulated Tabletop Shadow' : 'Simulated Projection'}
                </div>
              </div>
            </div>
          </div>

          {/* Optical Metric Note */}
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              The optical similarity score (
              <span className="font-mono text-amber-300 font-medium">
                {similarityPercentage > 0 ? `${similarityPercentage}%` : 'Pending'}
              </span>
              , MAE: {meanAbsoluteError > 0 ? meanAbsoluteError.toFixed(3) : '0.000'}) is an analytical ray-intersection simulation on the {light.target === 'tabletop' ? 'horizontal tabletop surface' : 'projection screen'}.
              {light.target === 'tabletop' && light.radialStruts > 0 && (
                <> The radial shadow lines correspond to structural struts ({light.radialStruts} struts × {light.strutWidthColumns ?? 2} cols, extending {(light.strutLength ?? (lamp.diameter / 2)).toFixed(0)}mm towards center) keeping floating pieces physically connected.</>
              )}
            </span>
          </div>

        </div>
      )}

      {/* Circular Polar Map Tab */}
      {activeTab === 'circularMap' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
            <div>
              <span className="font-medium text-slate-200">Circular Polar Projection Map</span>
              <span className="text-slate-500 ml-2">
                (Diameter: {lamp.diameter} mm, LED Cavity: {lamp.hasBase ? lamp.ledCavityDiameter : 20} mm)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Hole Geometry Style Switch */}
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                <button
                  onClick={() => setCircularHoleStyle('sharp-edges')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    circularHoleStyle === 'sharp-edges'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Sharp flat linear edges with clean diagonal facets (NO squares on edges)"
                >
                  📐 Sharp Flat Edges (No Squares)
                </button>
                <button
                  onClick={() => setCircularHoleStyle('smooth-arcs')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    circularHoleStyle === 'smooth-arcs'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Smooth flowing curved ribbons with rounded end-caps"
                >
                  ✨ Smooth Curves
                </button>
                <button
                  onClick={() => setCircularHoleStyle('circles')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    circularHoleStyle === 'circles'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Smooth round circular pinholes"
                >
                  ⚪ Round Holes
                </button>
              </div>

              <button
                onClick={handleDownloadCircularSvg}
                disabled={!cylindricalMask || isGenerating}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                  cylindricalMask && !isGenerating
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
                title="Download circular projection map in SVG format with sharp flat edges"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  Download SVG (
                  {circularHoleStyle === 'sharp-edges'
                    ? 'Sharp Flat Edges'
                    : circularHoleStyle === 'smooth-arcs'
                    ? 'Smooth Curves'
                    : 'Round Holes'}
                  )
                </span>
              </button>
            </div>
          </div>

          <div className="w-full h-80 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center relative shadow-inner p-2">
            <canvas ref={circularCanvasRef} className="h-full aspect-square object-contain" />
            <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-slate-900/90 backdrop-blur-sm text-[10px] text-slate-400 border border-slate-700/50 flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Gold: Light Openings ({circularHoleStyle === 'sharp-edges' ? 'Sharp Flat Edges' : circularHoleStyle === 'circles' ? 'Circles' : 'Curves'})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full border border-red-500" />
                Red Dashed: Outer Cut Border ({lamp.diameter} mm)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full border border-blue-500" />
                Blue Dashed: LED Center Cutout
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Precision Vector Ready (Sharp Flat Edges, No Squares):</strong> Silhouette boundaries and perforations
              are rendered with clean, sharp flat linear facets connecting seamlessly across polar rings, eliminating pixelated square stair-steps.
              Preserves true millimeter scale, outer perimeter cut ring, and LED center cavity guides for LightBurn, Inkscape, CNC, or Cricut.
            </span>
          </div>
        </div>
      )}

      {/* Cylindrical Unwrapped UV Perforation Mask Tab */}
      {activeTab === 'cylinderMask' && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div>
              <span className="font-medium text-slate-300">Unwrapped Cylindrical Perforation Mask</span>
              <span className="font-mono text-[11px] text-slate-500 ml-2">
                {gridWidth} × {gridHeight} cells (Circumference: {(Math.PI * lamp.diameter).toFixed(1)} mm × {lamp.height} mm)
              </span>
            </div>

            <button
              onClick={handleDownloadUnwrappedSvg}
              disabled={!cylindricalMask || isGenerating}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                cylindricalMask && !isGenerating
                  ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Unwrapped SVG</span>
            </button>
          </div>

          <div className="w-full h-44 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center relative shadow-inner">
            <canvas ref={maskCanvasRef} className="w-full h-full object-fill pixelated" />
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-900/80 backdrop-blur-sm text-[10px] text-slate-400 border border-slate-700/50">
              Gold = Open Perforations | Navy = Solid Shell
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            This 2D grid shows how the inverse ray projection unwraps and distorts the flat image
            to counteract the natural cylindrical curvature and point-source perspective.
          </p>
        </div>
      )}
    </div>
  );
};

