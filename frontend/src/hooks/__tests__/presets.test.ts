import { describe, expect, it } from 'vitest';
import { BUNDLED_IMAGES, presetParams } from '../useTealightGenerator';
import { DEFAULT_TEALIGHT_PARAMS } from '../../contracts/tealight';

describe('bundled image presets', () => {
  it('offers Batman, Shiva, Hanuman and Cat', () => {
    expect(BUNDLED_IMAGES.map((b) => b.id)).toEqual(['batman', 'shiva', 'hanuman', 'cat']);
  });
  it('sets invert on every preset (the default is on), so one preset never leaks its invert into the next', () => {
    for (const id of ['batman', 'shiva', 'hanuman', 'cat']) expect(presetParams(id).invert).toBe(DEFAULT_TEALIGHT_PARAMS.invert);
  });
  it('has no overrides for an unknown id', () => {
    expect(presetParams('nope')).toEqual({});
  });
});
