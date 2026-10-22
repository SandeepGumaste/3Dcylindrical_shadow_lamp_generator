export type Experience = 'guided' | 'advanced';
export type GuidedTheme = 'light' | 'dark';

const EXPERIENCE_KEY = 'odd-shadows:experience';
const THEME_KEY = 'odd-shadows:guided-theme';

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

/** localStorage can be missing or throw (private windows, blocked site data), so every access is guarded. */
const defaultStorage = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

function read<T extends string>(key: string, allowed: readonly T[], storage?: Reader): T | null {
  try {
    const s = storage ?? defaultStorage();
    const value = s?.getItem(key);
    return allowed.includes(value as T) ? (value as T) : null;
  } catch { return null; }
}

function write(key: string, value: string, storage?: Writer): void {
  try { (storage ?? defaultStorage())?.setItem(key, value); } catch { /* the choice just is not remembered */ }
}

/** The remembered answer to "are you new?", or null when nobody has answered (or storage is unavailable). */
export const readExperience = (storage?: Reader) => read<Experience>(EXPERIENCE_KEY, ['guided', 'advanced'], storage);
export const saveExperience = (value: Experience, storage?: Writer) => write(EXPERIENCE_KEY, value, storage);
export const readGuidedTheme = (storage?: Reader) => read<GuidedTheme>(THEME_KEY, ['light', 'dark'], storage);
export const saveGuidedTheme = (value: GuidedTheme, storage?: Writer) => write(THEME_KEY, value, storage);
