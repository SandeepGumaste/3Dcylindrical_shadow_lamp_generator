import type { TealightParams } from '../contracts/tealight';

type Params = Required<TealightParams>;
type NumberKey = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];
type BooleanKey = { [K in keyof Params]: Params[K] extends boolean ? K : never }[keyof Params];

export interface RangeItem {
  kind: 'range';
  key: NumberKey;
  label: string;
  unit?: string;
  /** A number, or 'radius' / '-radius': follow the shadow radius (the image offsets). */
  min: number | '-radius';
  max: number | 'radius';
  step: number;
  help?: string;
}
export interface CheckItem {
  kind: 'check';
  key: BooleanKey;
  label: string;
  help?: string;
  /** The hint is the rib optimizer's result once there is one. */
  hint?: 'ribs';
}
export interface ImagesItem { kind: 'images' }
export type Item = RangeItem | CheckItem | ImagesItem;
export interface Group { title?: string; sub?: string; items: Item[] }
export interface Step { id: string; title: string; sub: string; intro: string; groups: Group[]; export?: boolean }

const range = (key: NumberKey, label: string, min: RangeItem['min'], max: RangeItem['max'], step: number, extra: Partial<RangeItem> = {}): RangeItem =>
  ({ kind: 'range', key, label, min, max, step, ...extra });
const check = (key: BooleanKey, label: string, extra: Partial<CheckItem> = {}): CheckItem => ({ kind: 'check', key, label, ...extra });

export const GUIDED_STEPS: Step[] = [
  {
    id: 'image', title: 'Pick an image', sub: 'Image and placement',
    intro: 'Choose the picture the shadow should show. Black parts let light through, white parts stay solid.',
    groups: [
      { items: [{ kind: 'images' }] },
      { title: 'Pattern', sub: 'How the picture becomes holes.', items: [
        range('threshold', 'Threshold', 0, 255, 1, { help: 'Higher makes more of the picture solid.' }),
        range('edgeRounding', 'Edge rounding', 0, 40, 1, { help: 'Softens jagged edges before cutting holes.' }),
        check('invert', 'Invert', { help: 'Swap which parts are holes and which are solid.' }),
      ] },
      { title: 'Placement in the shadow', sub: 'Where the picture lands on the table.', items: [
        range('imageScale', 'Image size in shadow', 20, 200, 5, { unit: '%', help: 'How much of the shadow circle the picture fills.' }),
        range('imageOffsetX', 'Image offset X', '-radius', 'radius', 1, { unit: 'mm', help: 'Moves the picture right or left, relative to the light.' }),
        range('imageOffsetY', 'Image offset Y', '-radius', 'radius', 1, { unit: 'mm', help: 'Moves the picture up or down.' }),
      ] },
    ],
  },
  {
    id: 'shape', title: 'Shape the shade', sub: 'Size, height and light',
    intro: 'Choose how big the lamp is. Taller shades throw a bigger shadow, and a wider bottom leaves more room for detail.',
    groups: [
      { title: 'Shade', items: [
        range('innerDiameter', 'Inner diameter (bottom)', 44, 120, 0.5, { unit: 'mm', help: 'Must fit the tealight with room to spare.' }),
        range('topDiameter', 'Top diameter', 20, 120, 0.5, { unit: 'mm' }),
        range('height', 'Height', 30, 150, 1, { unit: 'mm' }),
        range('wallThickness', 'Wall thickness', 0.8, 4, 0.1, { unit: 'mm', help: 'Thicker walls are stronger but cut off more light.' }),
      ] },
      { title: 'Light', sub: 'A real flame, or an LED tealight that hangs from the top.', items: [
        check('useLed', 'Use LED tealight', { help: 'Hangs upside down from the top rim; flame height is worked out for you.' }),
        range('flameHeight', 'Flame height', 8, 100, 1, { unit: 'mm', help: 'Measured from the table, or from the top of the floor plate.' }),
        range('tealightDiameter', 'Tealight diameter', 30, 60, 0.5, { unit: 'mm' }),
        range('bodyHeight', 'LED body height', 8, 30, 1, { unit: 'mm' }),
        range('ledTipHeight', 'LED tip height', 2, 30, 1, { unit: 'mm' }),
      ] },
      { title: 'Shadow size', items: [
        range('shadowRadius', 'Shadow size (radius)', 60, 400, 1, { unit: 'mm', help: 'How far the picture reaches across the table.' }),
      ] },
    ],
  },
  {
    id: 'print', title: 'Make it printable', sub: 'Ribs, floor and detail',
    intro: 'Support the holes so the print holds together, and choose how fine the detail should be.',
    groups: [
      { title: 'Support ribs', sub: 'Vertical strips inside that hold wide holes together.', items: [
        check('autoRibs', 'Optimize ribs for printing', { hint: 'ribs' }),
        range('maxBridge', 'Max bridge span', 2, 20, 0.5, { unit: 'mm', help: 'The widest gap your printer can bridge without sagging.' }),
        range('ribs', 'Support ribs', 0, 48, 1, { help: 'Editing this turns the optimizer off.' }),
        range('ribWidth', 'Rib width', 0.8, 6, 0.2, { unit: 'mm' }),
      ] },
      { title: 'Floor and vents', items: [
        check('closeBottom', 'Close bottom (floor plate)', { help: 'The tealight then sits on the plate; flame height is measured from its top.' }),
        range('floorThickness', 'Floor thickness', 0.2, 3, 0.2, { unit: 'mm' }),
        range('vents', 'Base vents', 0, 16, 1, { help: 'Air holes at the bottom, for a real flame.' }),
        range('ventSize', 'Vent size', 3, 16, 0.5, { unit: 'mm' }),
      ] },
      { title: 'Detail', items: [
        check('autoBridge', 'Auto-bridge floating islands', { help: 'Adds thin strips so the middle of an “O” stays attached.' }),
        range('minFeature', 'Minimum feature (0 = off)', 0, 3, 0.1, { unit: 'mm', help: 'Drops holes and specks too small to print.' }),
        range('cols', 'Resolution (columns)', 120, 720, 20, { help: 'Higher keeps more detail and makes a bigger file.' }),
      ] },
    ],
  },
  {
    id: 'export', title: 'Generate and export', sub: 'STL and SVG',
    intro: 'Check the result, then download the files for your printer.',
    groups: [], export: true,
  },
];

/** Every setting that has a control, in step order. */
export function guidedKeys(): (keyof TealightParams)[] {
  return GUIDED_STEPS.flatMap((s) => s.groups.flatMap((g) => g.items.flatMap((i) => (i.kind === 'images' ? [] : [i.key]))));
}

/** Whether a control is greyed out. `effectiveRibs` is the rib count in use (the optimizer's, when it is on). */
export function isOff(key: keyof TealightParams, p: TealightParams, effectiveRibs: number): boolean {
  switch (key) {
    case 'flameHeight': return p.useLed;
    case 'bodyHeight': case 'ledTipHeight': return !p.useLed;
    case 'maxBridge': return !p.autoRibs;
    case 'ribWidth': return effectiveRibs === 0;
    case 'floorThickness': return !p.closeBottom;
    case 'vents': return p.closeBottom;
    case 'ventSize': return p.vents === 0;
    default: return false;
  }
}

export function rangeLimits(item: RangeItem, p: TealightParams): [number, number] {
  return [item.min === '-radius' ? -p.shadowRadius : item.min, item.max === 'radius' ? p.shadowRadius : item.max];
}

/** The settings to change when `key` is set to `value`, including the ones that follow from it. */
export function applyChange(key: keyof TealightParams, value: number | boolean, p: TealightParams, effectiveRibs: number): Partial<TealightParams> {
  if (key === 'ribs') return { ribs: value as number, autoRibs: false };
  if (key === 'closeBottom' && value === true) return { closeBottom: true, vents: 0 };
  if (key === 'autoRibs' && value === false) return { autoRibs: false, ribs: effectiveRibs };
  return { [key]: value } as Partial<TealightParams>;
}
