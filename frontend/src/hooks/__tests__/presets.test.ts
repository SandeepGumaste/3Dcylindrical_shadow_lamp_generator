import { describe, expect, it } from 'vitest';
import { BUNDLED_IMAGES, presetParams } from '../useTealightGenerator';

describe('bundled image presets', () => {
  it('offers Batman, Shiva, Hanuman and Cat', () => {
    expect(BUNDLED_IMAGES.map((b) => b.id)).toEqual(['batman', 'shiva', 'hanuman', 'cat']);
  });
  it('turns invert on for Shiva only; every other preset switches it off', () => {
    expect(presetParams('shiva').invert).toBe(true);
    for (const id of ['batman', 'hanuman', 'cat']) expect(presetParams(id).invert).toBe(false);
  });
  it('has no overrides for an unknown id', () => {
    expect(presetParams('nope')).toEqual({});
  });
});
