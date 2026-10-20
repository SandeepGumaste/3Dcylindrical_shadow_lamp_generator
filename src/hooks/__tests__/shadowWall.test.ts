import { describe, it, expect } from 'vitest';
import { isStale, inputKey, shouldGenerate, DEFAULT_WALL_IMAGE_ID } from '../useShadowWallGenerator';
import { DEFAULT_SHADOW_WALL_PARAMS, validateShadowWallParams } from '../../geometry/shadowWall/shadowWall';

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
  const base = inputKey(DEFAULT_SHADOW_WALL_PARAMS, 'batman', 0);
  it('is the same for the same inputs', () => {
    expect(inputKey({ ...DEFAULT_SHADOW_WALL_PARAMS }, 'batman', 0)).toBe(base);
  });
  it('changes with a parameter, the image or a new upload', () => {
    expect(inputKey({ ...DEFAULT_SHADOW_WALL_PARAMS, height: 60 }, 'batman', 0)).not.toBe(base);
    expect(inputKey(DEFAULT_SHADOW_WALL_PARAMS, 'cat', 0)).not.toBe(base);
    expect(inputKey(DEFAULT_SHADOW_WALL_PARAMS, 'upload', 1)).not.toBe(base);
  });
});

describe('when to generate on its own', () => {
  it('generates the first time the image is there', () => {
    expect(shouldGenerate(null, 'batman')).toBe(true);
  });
  it('does not generate again for the same image', () => {
    expect(shouldGenerate('batman', 'batman')).toBe(false);
  });
  it('generates when the image changed', () => {
    expect(shouldGenerate('batman', 'cat')).toBe(true);
  });
});

describe('defaults', () => {
  it('start on Batman', () => {
    expect(DEFAULT_WALL_IMAGE_ID).toBe('batman');
  });
  it('validate clean', () => {
    expect(validateShadowWallParams(DEFAULT_SHADOW_WALL_PARAMS)).toEqual([]);
  });
});
