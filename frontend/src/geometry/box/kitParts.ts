import type { TrayId } from '../../contracts/box';
export type { TrayId };

export interface BundledPart {
  id: string;
  file: string;
  label: string;
}

const SHARED: BundledPart[] = [
  { id: 'lamp-post', file: 'lamp-post.stl', label: 'Lamp post' },
  { id: 'lamp-cap', file: 'lamp-cap.stl', label: 'Lamp cap' },
  { id: 'wall-hook', file: 'wall-hook.stl', label: 'Wall hook' },
];

const BY_TRAY: Record<TrayId, BundledPart[]> = {
  '2AA': [
    { id: 'tray-2aa', file: 'tray-2aa.stl', label: 'Tray (2×AA)' },
    { id: 'cover-2aa', file: 'cover-2aa.stl', label: 'Battery cover (2×AA)' },
  ],
  '2AAA': [
    { id: 'tray-2aaa', file: 'tray-2aaa.stl', label: 'Tray (2×AAA)' },
    { id: 'cover-2aaa', file: 'cover-2aaa.stl', label: 'Battery cover (2×AAA)' },
  ],
};

/** The fixed parts of the kit for a tray choice, exactly as in the owner's files. */
export function bundledPartsFor(tray: TrayId): BundledPart[] {
  return [...BY_TRAY[tray], ...SHARED];
}
