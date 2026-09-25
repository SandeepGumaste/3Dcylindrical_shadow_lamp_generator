import { LampConfig } from '../types';

export interface CircularSvgOptions {
  outerRadiusMm?: number; // e.g. lamp.diameter / 2 or customized
  innerRadiusMm?: number; // center hole for LED/mount
  style?: 'sharp-edges' | 'circles' | 'smooth-arcs' | 'annular-sectors'; // default 'sharp-edges' (sharp flat edges, no squares)
  strokeWidth?: number; // mm
  fillColor?: string;
  backgroundColor?: string;
  includeCutLines?: boolean;
}

export interface UnwrappedSvgOptions {
  scaleMm?: boolean; // Use mm units for laser cutting
  includeCutLines?: boolean;
  fillColor?: string;
  backgroundColor?: string;
  style?: 'sharp-edges' | 'rectangles'; // default 'sharp-edges'
}

export interface Span {
  start: number;
  end: number;
}

/**
 * Extracts contiguous 1-spans along a row.
 */
export function getRowSpans(
  mask: Uint8Array | Float32Array,
  row: number,
  gridWidth: number
): Span[] {
  const spans: Span[] = [];
  let inSpan = false;
  let start = 0;

  for (let c = 0; c < gridWidth; c++) {
    const isOpen = mask[row * gridWidth + c] > 0.5;
    if (isOpen && !inSpan) {
      inSpan = true;
      start = c;
    } else if (!isOpen && inSpan) {
      inSpan = false;
      spans.push({ start, end: c - 1 });
    }
  }
  if (inSpan) {
    spans.push({ start, end: gridWidth - 1 });
  }
  return spans;
}

/**
 * Finds an overlapping span in an adjacent row, if any.
 */
function findOverlappingSpan(spans: Span[], target: Span): Span | null {
  for (const s of spans) {
    if (Math.max(s.start, target.start) <= Math.min(s.end, target.end)) {
      return s;
    }
  }
  return null;
}

/**
 * Generates a precision vector SVG of the Circular Polar Map with SHARP FLAT EDGES (no squares on edges).
 * Maps cylindrical coordinates:
 * - Angle theta (-PI to +PI) -> polar angle (0 to 2*PI)
 * - Vertical height (0 to H) -> radial distance (innerRadius to outerRadius)
 * Boundaries form clean flat linear facets connecting seamlessly across rings without pixel staircase steps.
 */
export function generateCircularMapSvg(
  mask: Uint8Array | Float32Array,
  gridWidth: number,
  gridHeight: number,
  lamp: LampConfig,
  options: CircularSvgOptions = {}
): string {
  const outerR = options.outerRadiusMm ?? lamp.diameter / 2;
  const innerR = options.innerRadiusMm ?? (lamp.hasBase ? lamp.ledCavityDiameter / 2 : outerR * 0.25);
  const size = outerR * 2 + 20; // 10mm margin
  const cx = size / 2;
  const cy = size / 2;
  const style = options.style ?? 'sharp-edges'; // Default: sharp flat edges (no squares on edges)
  const fillColor = options.fillColor || '#f59e0b';

  const elements: string[] = [];
  const dTheta = (2 * Math.PI) / gridWidth;
  const dr = (outerR - innerR) / gridHeight;

  if (style === 'sharp-edges') {
    // Precompute all spans per row
    const allSpans: Span[][] = [];
    for (let r = 0; r < gridHeight; r++) {
      allSpans.push(getRowSpans(mask, r, gridWidth));
    }

    for (let row = 0; row < gridHeight; row++) {
      const r0 = innerR + row * dr;
      const r1 = r0 + dr;
      const currentSpans = allSpans[row];
      const prevSpans = row > 0 ? allSpans[row - 1] : [];
      const nextSpans = row < gridHeight - 1 ? allSpans[row + 1] : [];

      for (const span of currentSpans) {
        const prev = findOverlappingSpan(prevSpans, span);
        const next = findOverlappingSpan(nextSpans, span);

        // Interpolate boundary column indices for sharp flat diagonal edges
        const cInStart = prev ? 0.5 * (span.start + prev.start) : span.start;
        const cOutStart = next ? 0.5 * (span.start + next.start) : span.start;

        const cInEnd = prev ? 0.5 * (span.end + 1 + prev.end + 1) : span.end + 1;
        const cOutEnd = next ? 0.5 * (span.end + 1 + next.end + 1) : span.end + 1;

        // Polar angles
        const thInStart = (cInStart / gridWidth) * 2 * Math.PI - Math.PI;
        const thOutStart = (cOutStart / gridWidth) * 2 * Math.PI - Math.PI;
        const thOutEnd = (cOutEnd / gridWidth) * 2 * Math.PI - Math.PI;
        const thInEnd = (cInEnd / gridWidth) * 2 * Math.PI - Math.PI;

        // 4 Key vertices:
        // P0: (r0, thInStart)
        // P1: (r1, thOutStart)
        // P2: (r1, thOutEnd)
        // P3: (r0, thInEnd)
        const x0 = cx + r0 * Math.cos(thInStart);
        const y0 = cy + r0 * Math.sin(thInStart);
        const x1 = cx + r1 * Math.cos(thOutStart);
        const y1 = cy + r1 * Math.sin(thOutStart);
        const x2 = cx + r1 * Math.cos(thOutEnd);
        const y2 = cy + r1 * Math.sin(thOutEnd);
        const x3 = cx + r0 * Math.cos(thInEnd);
        const y3 = cy + r0 * Math.sin(thInEnd);

        const arcOut = Math.abs(thOutEnd - thOutStart);
        const arcIn = Math.abs(thInEnd - thInStart);
        const largeArcOut = arcOut > Math.PI ? 1 : 0;
        const largeArcIn = arcIn > Math.PI ? 1 : 0;

        // Closed shape with sharp flat straight side edges and concentric arcs
        const pathD = `M ${x0.toFixed(3)} ${y0.toFixed(3)} ` +
          `L ${x1.toFixed(3)} ${y1.toFixed(3)} ` +
          `A ${r1.toFixed(3)} ${r1.toFixed(3)} 0 ${largeArcOut} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} ` +
          `L ${x3.toFixed(3)} ${y3.toFixed(3)} ` +
          `A ${r0.toFixed(3)} ${r0.toFixed(3)} 0 ${largeArcIn} 0 ${x0.toFixed(3)} ${y0.toFixed(3)} Z`;

        elements.push(`<path d="${pathD}" fill="${fillColor}" />`);
      }
    }
  } else if (style === 'circles') {
    // Round circular holes option
    for (let row = 0; row < gridHeight; row++) {
      const r = innerR + (row + 0.5) * dr;
      const arcWidth = r * dTheta;
      const holeR = Math.max(0.25, Math.min(dr, arcWidth) * 0.45 * (lamp.holeSize ?? 0.85));

      for (let col = 0; col < gridWidth; col++) {
        const idx = row * gridWidth + col;
        if (mask[idx] <= 0.5) continue;

        const theta = (col + 0.5) * dTheta - Math.PI;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);

        elements.push(
          `<circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="${holeR.toFixed(3)}" fill="${fillColor}" />`
        );
      }
    }
  } else if (style === 'smooth-arcs') {
    // Smooth continuous curved ribbons with rounded caps
    for (let row = 0; row < gridHeight; row++) {
      const rCenter = innerR + (row + 0.5) * dr;
      const strokeW = Math.max(0.2, dr * 0.9 * (lamp.holeSize ?? 0.85));

      let startCol: number | null = null;
      for (let col = 0; col <= gridWidth; col++) {
        const isOpen = col < gridWidth && mask[row * gridWidth + col] > 0.5;

        if (isOpen && startCol === null) {
          startCol = col;
        } else if (!isOpen && startCol !== null) {
          const endCol = col - 1;
          const th0 = (startCol + 0.5) * dTheta - Math.PI;
          const th1 = (endCol + 0.5) * dTheta - Math.PI;

          if (startCol === endCol) {
            const x = cx + rCenter * Math.cos(th0);
            const y = cy + rCenter * Math.sin(th0);
            elements.push(
              `<circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="${(strokeW * 0.5).toFixed(3)}" fill="${fillColor}" />`
            );
          } else {
            const x0 = cx + rCenter * Math.cos(th0);
            const y0 = cy + rCenter * Math.sin(th0);
            const x1 = cx + rCenter * Math.cos(th1);
            const y1 = cy + rCenter * Math.sin(th1);

            const arcSpan = (endCol - startCol) * dTheta;
            const largeArc = arcSpan > Math.PI ? 1 : 0;

            const pathD = `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${rCenter.toFixed(3)} ${rCenter.toFixed(3)} 0 ${largeArc} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
            elements.push(
              `<path d="${pathD}" fill="none" stroke="${fillColor}" stroke-width="${strokeW.toFixed(3)}" stroke-linecap="round" />`
            );
          }

          startCol = null;
        }
      }
    }
  } else {
    // Annular sectors
    for (let row = 0; row < gridHeight; row++) {
      const r0 = innerR + row * dr;
      const r1 = r0 + dr;

      for (let col = 0; col < gridWidth; col++) {
        const idx = row * gridWidth + col;
        if (mask[idx] <= 0.5) continue;

        const th0 = col * dTheta - Math.PI;
        const th1 = th0 + dTheta;

        const x0 = cx + r0 * Math.cos(th0);
        const y0 = cy + r0 * Math.sin(th0);
        const x1 = cx + r1 * Math.cos(th0);
        const y1 = cy + r1 * Math.sin(th0);
        const x2 = cx + r1 * Math.cos(th1);
        const y2 = cy + r1 * Math.sin(th1);
        const x3 = cx + r0 * Math.cos(th1);
        const y3 = cy + r0 * Math.sin(th1);

        const d = `M ${x0.toFixed(3)} ${y0.toFixed(3)} ` +
          `L ${x1.toFixed(3)} ${y1.toFixed(3)} ` +
          `A ${r1.toFixed(3)} ${r1.toFixed(3)} 0 0 1 ${x2.toFixed(3)} ${y2.toFixed(3)} ` +
          `L ${x3.toFixed(3)} ${y3.toFixed(3)} ` +
          `A ${r0.toFixed(3)} ${r0.toFixed(3)} 0 0 0 ${x0.toFixed(3)} ${y0.toFixed(3)} Z`;

        elements.push(`<path d="${d}" fill="${fillColor}" />`);
      }
    }
  }

  // Guidelines / laser cut boundaries
  const cutLines: string[] = [];
  if (options.includeCutLines !== false) {
    cutLines.push(
      `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${outerR.toFixed(3)}" fill="none" stroke="#ef4444" stroke-width="0.2" stroke-dasharray="2,2" />`
    );
    cutLines.push(
      `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${innerR.toFixed(3)}" fill="none" stroke="#3b82f6" stroke-width="0.2" stroke-dasharray="2,2" />`
    );
    cutLines.push(
      `<line x1="${(cx - outerR).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${(cx + outerR).toFixed(2)}" y2="${cy.toFixed(2)}" stroke="#64748b" stroke-width="0.1" stroke-dasharray="1,3" />`
    );
    cutLines.push(
      `<line x1="${cx.toFixed(2)}" y1="${(cy - outerR).toFixed(2)}" x2="${cx.toFixed(2)}" y2="${(cy + outerR).toFixed(2)}" stroke="#64748b" stroke-width="0.1" stroke-dasharray="1,3" />`
    );
  }

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     viewBox="0 0 ${size.toFixed(2)} ${size.toFixed(2)}" 
     width="${size.toFixed(2)}mm" 
     height="${size.toFixed(2)}mm">
  <title>Shadow Lamp - Circular Polar Map (Sharp Flat Edges)</title>
  <desc>Circular projection map with sharp flat edges and no square pixel steps (Diameter: ${lamp.diameter}mm, Height: ${lamp.height}mm)</desc>
  <rect width="100%" height="100%" fill="${options.backgroundColor || '#090d16'}" />
  <g id="perforations">
    ${elements.join('\n    ')}
  </g>
  <g id="guides">
    ${cutLines.join('\n    ')}
  </g>
</svg>`;

  return svgContent;
}

/**
 * Generates an unwrapped rectangular flat cylindrical map in SVG format with sharp flat edges.
 * Contiguous cells in each row are merged into clean polygons with sharp flat slanted transitions.
 * Directly usable for flat sheet laser cutting, CNC milling, or paper stencils.
 */
export function generateUnwrappedMapSvg(
  mask: Uint8Array | Float32Array,
  gridWidth: number,
  gridHeight: number,
  lamp: LampConfig,
  options: UnwrappedSvgOptions = {}
): string {
  const widthMm = Math.PI * lamp.diameter;
  const heightMm = lamp.height;
  const marginMm = 5;
  const totalWidth = widthMm + marginMm * 2;
  const totalHeight = heightMm + marginMm * 2;

  const cellH = heightMm / gridHeight;
  const fillColor = options.fillColor || '#f59e0b';

  // Extract spans per row
  const allSpans: Span[][] = [];
  for (let r = 0; r < gridHeight; r++) {
    allSpans.push(getRowSpans(mask, r, gridWidth));
  }

  const polygons: string[] = [];

  for (let row = 0; row < gridHeight; row++) {
    // Canvas / SVG Y is inverted (top is row = gridHeight - 1)
    const yTop = marginMm + (gridHeight - 1 - row) * cellH;
    const yBot = yTop + cellH;

    const currentSpans = allSpans[row];
    const prevSpans = row > 0 ? allSpans[row - 1] : [];
    const nextSpans = row < gridHeight - 1 ? allSpans[row + 1] : [];

    for (const span of currentSpans) {
      const prev = findOverlappingSpan(prevSpans, span);
      const next = findOverlappingSpan(nextSpans, span);

      // Interpolate boundary column indices for sharp flat diagonal edges
      const cInStart = prev ? 0.5 * (span.start + prev.start) : span.start;
      const cOutStart = next ? 0.5 * (span.start + next.start) : span.start;

      const cInEnd = prev ? 0.5 * (span.end + 1 + prev.end + 1) : span.end + 1;
      const cOutEnd = next ? 0.5 * (span.end + 1 + next.end + 1) : span.end + 1;

      const x0 = marginMm + (cInStart / gridWidth) * widthMm;
      const x1 = marginMm + (cOutStart / gridWidth) * widthMm;
      const x2 = marginMm + (cOutEnd / gridWidth) * widthMm;
      const x3 = marginMm + (cInEnd / gridWidth) * widthMm;

      polygons.push(
        `<polygon points="${x0.toFixed(3)},${yBot.toFixed(3)} ${x1.toFixed(3)},${yTop.toFixed(3)} ${x2.toFixed(3)},${yTop.toFixed(3)} ${x3.toFixed(3)},${yBot.toFixed(3)}" fill="${fillColor}" />`
      );
    }
  }

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     viewBox="0 0 ${totalWidth.toFixed(2)} ${totalHeight.toFixed(2)}" 
     width="${totalWidth.toFixed(2)}mm" 
     height="${totalHeight.toFixed(2)}mm">
  <title>Shadow Lamp - Unwrapped Flat Cylindrical Map (Sharp Flat Edges)</title>
  <desc>Unwrapped stencil map with sharp flat edges (Circumference: ${widthMm.toFixed(2)}mm, Height: ${heightMm.toFixed(2)}mm)</desc>
  <rect width="100%" height="100%" fill="${options.backgroundColor || '#090d16'}" />
  <g id="perforations">
    ${polygons.join('\n    ')}
  </g>
  ${
    options.includeCutLines !== false
      ? `<rect x="${marginMm.toFixed(3)}" y="${marginMm.toFixed(3)}" width="${widthMm.toFixed(3)}" height="${heightMm.toFixed(3)}" fill="none" stroke="#ef4444" stroke-width="0.2" stroke-dasharray="2,2" />`
      : ''
  }
</svg>`;

  return svgContent;
}

/**
 * Triggers a client-side download of an SVG file.
 */
export function downloadSVG(svgContent: string, filename: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
