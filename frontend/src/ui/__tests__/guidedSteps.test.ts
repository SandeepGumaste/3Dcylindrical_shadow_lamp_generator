import { describe, it, expect } from 'vitest';
import { GUIDED_STEPS, guidedKeys, isOff, applyChange, rangeLimits, type Item } from '../guidedSteps';
import { DEFAULT_TEALIGHT_PARAMS, type TealightParams } from '../../geometry/tealightShade';

const P = (o: Partial<TealightParams> = {}): TealightParams => ({ ...DEFAULT_TEALIGHT_PARAMS, ...o });

/** Everything the current Tealight panel lets the user change. */
const PANEL_SETTINGS = [
  'threshold', 'edgeRounding', 'invert', 'imageScale', 'imageOffsetX', 'imageOffsetY',
  'innerDiameter', 'topDiameter', 'height', 'wallThickness', 'cols', 'flameHeight', 'shadowRadius',
  'autoRibs', 'maxBridge', 'ribs', 'ribWidth', 'closeBottom', 'floorThickness', 'vents', 'ventSize',
  'autoBridge', 'minFeature', 'useLed', 'tealightDiameter', 'bodyHeight', 'ledTipHeight',
].sort();

const itemsOf = (stepIndex: number): Item[] => GUIDED_STEPS[stepIndex].groups.flatMap((g) => g.items);
const keysOf = (stepIndex: number) => itemsOf(stepIndex).flatMap((i) => ('key' in i ? [i.key as string] : []));

describe('guided steps', () => {
  it('has the four steps in order', () => {
    expect(GUIDED_STEPS.map((s) => s.title)).toEqual(['Pick an image', 'Shape the shade', 'Make it printable', 'Generate and export']);
    expect(GUIDED_STEPS[3].export).toBe(true);
  });

  it('places every Tealight setting in exactly one step', () => {
    const keys = guidedKeys().map(String);
    expect([...keys].sort()).toEqual(PANEL_SETTINGS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only uses settings that exist, as numbers for sliders and booleans for checkboxes', () => {
    for (const item of GUIDED_STEPS.flatMap((s) => s.groups.flatMap((g) => g.items))) {
      if (item.kind === 'images') continue;
      expect(item.key in DEFAULT_TEALIGHT_PARAMS, String(item.key)).toBe(true);
      expect(typeof DEFAULT_TEALIGHT_PARAMS[item.key], String(item.key)).toBe(item.kind === 'range' ? 'number' : 'boolean');
    }
  });

  it('keeps the image placement in step 1, the shade and the light in step 2, resolution and ribs in step 3', () => {
    expect(keysOf(0)).toEqual(expect.arrayContaining(['threshold', 'edgeRounding', 'invert', 'imageScale', 'imageOffsetX', 'imageOffsetY']));
    expect(keysOf(1)).toEqual(expect.arrayContaining(['innerDiameter', 'topDiameter', 'height', 'wallThickness', 'useLed', 'flameHeight', 'tealightDiameter', 'bodyHeight', 'ledTipHeight', 'shadowRadius']));
    expect(keysOf(2)).toEqual(expect.arrayContaining(['autoRibs', 'maxBridge', 'ribs', 'ribWidth', 'closeBottom', 'floorThickness', 'vents', 'ventSize', 'autoBridge', 'minFeature', 'cols']));
    expect(keysOf(3)).toEqual([]);
  });

  it('offers the bundled images and the upload in step 1', () => {
    expect(itemsOf(0).some((i) => i.kind === 'images')).toBe(true);
  });
});

describe('which controls are greyed out', () => {
  it('follows the light source', () => {
    expect(isOff('flameHeight', P({ useLed: true }), 20)).toBe(true);
    expect(isOff('flameHeight', P({ useLed: false }), 20)).toBe(false);
    for (const key of ['bodyHeight', 'ledTipHeight'] as const) {
      expect(isOff(key, P({ useLed: false }), 20)).toBe(true);
      expect(isOff(key, P({ useLed: true }), 20)).toBe(false);
    }
  });
  it('follows the rib optimizer and the rib count', () => {
    expect(isOff('maxBridge', P({ autoRibs: false }), 20)).toBe(true);
    expect(isOff('maxBridge', P({ autoRibs: true }), 20)).toBe(false);
    expect(isOff('ribWidth', P(), 0)).toBe(true);
    expect(isOff('ribWidth', P(), 6)).toBe(false);
  });
  it('follows the floor and the vents', () => {
    expect(isOff('floorThickness', P({ closeBottom: false }), 6)).toBe(true);
    expect(isOff('floorThickness', P({ closeBottom: true }), 6)).toBe(false);
    expect(isOff('vents', P({ closeBottom: true }), 6)).toBe(true);
    expect(isOff('vents', P({ closeBottom: false }), 6)).toBe(false);
    expect(isOff('ventSize', P({ closeBottom: false, vents: 0 }), 6)).toBe(true);
    expect(isOff('ventSize', P({ closeBottom: false, vents: 4 }), 6)).toBe(false);
  });
  it('leaves every other control on', () => {
    expect(isOff('height', P(), 6)).toBe(false);
    expect(isOff('threshold', P(), 6)).toBe(false);
  });
});

describe('how a change is applied', () => {
  it('turns the optimizer off when the rib count is edited', () => {
    expect(applyChange('ribs', 12, P(), 20)).toEqual({ ribs: 12, autoRibs: false });
  });
  it('clears the vents when the bottom is closed', () => {
    expect(applyChange('closeBottom', true, P({ vents: 6, closeBottom: false }), 6)).toEqual({ closeBottom: true, vents: 0 });
    expect(applyChange('closeBottom', false, P(), 6)).toEqual({ closeBottom: false });
  });
  it('keeps the current rib count when the optimizer is turned off, and just turns it on otherwise', () => {
    expect(applyChange('autoRibs', false, P({ ribs: 6 }), 18)).toEqual({ autoRibs: false, ribs: 18 });
    expect(applyChange('autoRibs', true, P(), 18)).toEqual({ autoRibs: true });
  });
  it('passes every other change straight through', () => {
    expect(applyChange('height', 90, P(), 6)).toEqual({ height: 90 });
    expect(applyChange('invert', true, P(), 6)).toEqual({ invert: true });
  });
});

describe('slider limits', () => {
  it('limits the image offsets to the shadow radius', () => {
    const offset = itemsOf(0).find((i) => i.kind === 'range' && i.key === 'imageOffsetX')!;
    expect(rangeLimits(offset as Extract<Item, { kind: 'range' }>, P({ shadowRadius: 200 }))).toEqual([-200, 200]);
  });
  it('uses the fixed limits elsewhere', () => {
    const height = itemsOf(1).find((i) => i.kind === 'range' && i.key === 'height')!;
    expect(rangeLimits(height as Extract<Item, { kind: 'range' }>, P())).toEqual([30, 150]);
  });
});
