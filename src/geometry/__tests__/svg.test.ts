import { describe, it, expect } from 'vitest';
import { generateCircularMapSvg, generateUnwrappedMapSvg, getSmoothedRowSpanBounds } from '../svg';
import { LampConfig } from '../../types';

describe('SVG Map Exporter', () => {
  const lamp: LampConfig = {
    diameter: 90,
    height: 100,
    wallThickness: 1.2,
    minFeatureSize: 0.8,
    holeSize: 0.8,
    segmentsAround: 36,
    segmentsVertical: 20,
    topRimHeight: 4,
    bottomRimHeight: 6,
    hasBase: true,
    baseHeight: 8,
    ledCavityDiameter: 38,
    ledCavityDepth: 6,
    wireSlotWidth: 3.5,
  };

  it('generates a valid Circular Map SVG string with sharp flat edges (no square holes) and metadata', () => {
    const mask = new Uint8Array(lamp.segmentsAround * lamp.segmentsVertical);
    // Mark a few perforations
    mask[5 * lamp.segmentsAround + 10] = 1;
    mask[5 * lamp.segmentsAround + 11] = 1;

    const svg = generateCircularMapSvg(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Circular Polar Map');
    // Sharp flat edges: M, L, A path
    expect(svg).toContain('<path d="M');
    expect(svg).toContain('viewBox');
    expect(svg).toContain('width=');

    // Also test circles mode
    const svgCircles = generateCircularMapSvg(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp, {
      style: 'circles',
    });
    expect(svgCircles).toContain('<circle cx=');
  });

  it('generates a valid Unwrapped Map SVG string with real millimeter dimensions and sharp flat edges', () => {
    const mask = new Uint8Array(lamp.segmentsAround * lamp.segmentsVertical);
    mask[2 * lamp.segmentsAround + 3] = 1;

    const svg = generateUnwrappedMapSvg(mask, lamp.segmentsAround, lamp.segmentsVertical, lamp);

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Unwrapped Flat Cylindrical Map');
    expect(svg).toContain('<polygon');
  });

  it('interpolates a hole boundary that shifts between rows into a smooth diagonal, not a hard step', () => {
    const gridWidth = 40;
    const gridHeight = 10;
    const mask = new Uint8Array(gridWidth * gridHeight);

    // Row 4: hole spans columns 10-15. Row 5: the same hole shifted right to columns 14-19
    // (simulating a diagonal silhouette edge crossing this row boundary).
    for (let c = 10; c <= 15; c++) mask[4 * gridWidth + c] = 1;
    for (let c = 14; c <= 19; c++) mask[5 * gridWidth + c] = 1;

    const row4Bounds = getSmoothedRowSpanBounds(mask, gridWidth, gridHeight, 4);
    const row5Bounds = getSmoothedRowSpanBounds(mask, gridWidth, gridHeight, 5);

    expect(row4Bounds).toHaveLength(1);
    expect(row5Bounds).toHaveLength(1);

    // Row 4's top edge (facing row 5) should sit between the two rows' raw boundaries,
    // not snapped to either one - that's the diagonal facet replacing the staircase.
    expect(row4Bounds[0].cOutStart).toBeGreaterThan(10);
    expect(row4Bounds[0].cOutStart).toBeLessThan(14);

    // Row 4's bottom edge (facing row 3, which has no hole) has no neighbor to interpolate
    // against, so it stays at the raw grid boundary.
    expect(row4Bounds[0].cInStart).toBe(10);

    // Row 4's interpolated top-facing boundary and row 5's interpolated bottom-facing
    // boundary describe the exact same physical seam, so they must agree - otherwise the
    // 3D mesh built from this would have a gap or overlap at that seam.
    expect(row4Bounds[0].cOutStart).toBeCloseTo(row5Bounds[0].cInStart, 10);
    expect(row4Bounds[0].cOutEnd).toBeCloseTo(row5Bounds[0].cInEnd, 10);
  });
});
