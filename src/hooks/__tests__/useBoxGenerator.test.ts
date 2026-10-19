import { describe, it, expect } from 'vitest';
import { isStale, inputKey, shouldGenerate } from '../useBoxGenerator';
import { DEFAULT_BOX_PARAMS, validateBoxParams } from '../../geometry/box/rimProfile';

describe('out-of-date rule', () => {
  it('is not stale before anything has been generated', () => {
    expect(isStale('a', null, false)).toBe(false);
  });
  it('is not stale while the inputs match the generated model', () => {
    expect(isStale('a', 'a', true)).toBe(false);
  });
  it('is stale once the inputs differ from the generated model', () => {
    expect(isStale('b', 'a', true)).toBe(true);
  });
});

describe('input key', () => {
  const base = inputKey(DEFAULT_BOX_PARAMS, 1, 1);
  it('is the same for the same inputs', () => {
    expect(inputKey({ ...DEFAULT_BOX_PARAMS }, 1, 1)).toBe(base);
  });
  it('changes with any parameter or with either image', () => {
    expect(inputKey({ ...DEFAULT_BOX_PARAMS, lightHeight: 41 }, 1, 1)).not.toBe(base);
    expect(inputKey({ ...DEFAULT_BOX_PARAMS, tray: '2AAA' }, 1, 1)).not.toBe(base);
    expect(inputKey(DEFAULT_BOX_PARAMS, 2, 1)).not.toBe(base);
    expect(inputKey(DEFAULT_BOX_PARAMS, 1, 2)).not.toBe(base);
  });
});

describe('parameter validation', () => {
  it('accepts the defaults', () => {
    expect(validateBoxParams(DEFAULT_BOX_PARAMS)).toEqual([]);
  });
  it('names the problem for a light height the post cannot give', () => {
    expect(validateBoxParams({ ...DEFAULT_BOX_PARAMS, lightHeight: 5 }).join(' ')).toMatch(/Light height/);
    expect(validateBoxParams({ ...DEFAULT_BOX_PARAMS, lightHeight: 80 }).join(' ')).toMatch(/Light height/);
  });
  it('rejects a shadow size of zero and negative widths', () => {
    expect(validateBoxParams({ ...DEFAULT_BOX_PARAMS, shadowSize: 0 }).join(' ')).toMatch(/Shadow size/);
    expect(validateBoxParams({ ...DEFAULT_BOX_PARAMS, minSpike: -1 }).join(' ')).toMatch(/Minimum spike/);
  });
});

describe('when to generate on its own', () => {
  it('generates the first time both images are there', () => {
    expect(shouldGenerate(null, 1, 1)).toBe(true);
  });
  it('does not generate again when the mode is shown again with the same images', () => {
    expect(shouldGenerate([1, 1], 1, 1)).toBe(false);
  });
  it('generates when either image changed', () => {
    expect(shouldGenerate([1, 1], 2, 1)).toBe(true);
    expect(shouldGenerate([1, 1], 1, 2)).toBe(true);
  });
});
