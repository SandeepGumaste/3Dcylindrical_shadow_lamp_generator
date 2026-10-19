import { describe, it, expect } from 'vitest';
import { readExperience, saveExperience, readGuidedTheme, saveGuidedTheme } from '../experience';

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
};
const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

describe('remembered experience', () => {
  it('is null before anyone has answered', () => {
    expect(readExperience(memory())).toBeNull();
  });
  it('reads back what was saved', () => {
    const s = memory();
    saveExperience('guided', s);
    expect(readExperience(s)).toBe('guided');
    saveExperience('advanced', s);
    expect(readExperience(s)).toBe('advanced');
  });
  it('ignores anything else that is stored', () => {
    expect(readExperience(memory({ 'odd-shadows:experience': 'expert' }))).toBeNull();
  });
  it('asks again instead of failing when storage is blocked', () => {
    expect(readExperience(broken)).toBeNull();
    expect(() => saveExperience('guided', broken)).not.toThrow();
  });
});

describe('remembered guided theme', () => {
  it('is null until chosen, then reads back', () => {
    const s = memory();
    expect(readGuidedTheme(s)).toBeNull();
    saveGuidedTheme('dark', s);
    expect(readGuidedTheme(s)).toBe('dark');
    saveGuidedTheme('light', s);
    expect(readGuidedTheme(s)).toBe('light');
  });
  it('ignores bad values and blocked storage', () => {
    expect(readGuidedTheme(memory({ 'odd-shadows:guided-theme': 'purple' }))).toBeNull();
    expect(readGuidedTheme(broken)).toBeNull();
    expect(() => saveGuidedTheme('dark', broken)).not.toThrow();
  });
});
