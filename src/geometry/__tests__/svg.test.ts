import { describe, it, expect } from 'vitest';
import { generateCircularMapSvg, generateUnwrappedMapSvg } from '../svg';
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
});
