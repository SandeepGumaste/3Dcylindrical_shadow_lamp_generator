/**
 * Measured constants of the owner's 120 x 150 mm shadow-box kit (battery-box version), taken from
 * the original STLs with scripts/measure-kit.ts. All lengths in mm.
 *
 * Plan frame ("tray frame"): x across the 120 mm width, y along the 150 mm length, seen from the
 * front, y up. The post bore is at the box centre; the keyhole recess is towards y = 150 (the top).
 * Vertical axis: z up from the mounting wall. The walls stand in the 3 mm channel outside the tray's
 * inner wall, on the tray skirt at `wallSeatZ`; their 12.5 mm tabs reach the notches in that inner wall.
 * Wall frame: x is the plate's height direction (from the seating edge), y its length, z through the plate.
 */
export type WallId = 'w1' | 'w2' | 'w3' | 'w4';
export const WALL_IDS: WallId[] = ['w1', 'w2', 'w3', 'w4'];

export interface Feature {
  kind: 'tab';
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
}

export interface WallSpec {
  /** Plate length (y) and height (x) of the original part. */
  length: number;
  maxHeight: number;
  /** The edge that seats on the tray is at x = maxHeight (true) or x = 0 (false). */
  attachAtMax: boolean;
  /** Where the wall stands in the tray frame; `at` is the outer face line, `from` where s = 0 starts. */
  plan: { fixed: 'x' | 'y'; at: number; from: number; dir: 1 | -1 };
  features: Feature[];
}

const TAB_Z = { z0: 3, z1: 4.2 };

export const KIT = {
  boxW: 120,
  boxD: 150,
  plateThickness: 3,
  /** Height of the tray skirt the wall plates sit on (the tray's inner wall rises to 20 mm). */
  wallSeatZ: 7.46,
  /** Panel plate top: the panel rests on the 18.5 mm pad and its plate is 3 mm thick. */
  T: 21.5,
  /** Distance from a wall's seating edge up to the panel plane (T - wallSeatZ). */
  panelPlaneX: 14.04,
  /** Picture panel: a plate with the picture raised to one of two heights inside a plain border. */
  panel: { w: 113.9, h: 143.9, plate: 3, border: 1.4, lightTop: 3.5, darkTop: 4, holeDiameter: 10.4 },
  post: { length: 60, floorZ: 3 },
  /** Centre of the 10 mm post bore in the tray (the keyhole recess is a separate feature higher up). */
  lightAxis: { x: 60, y: 75 },
  /** LED height above the panel: the 60 mm post stands on the tray floor and the 11.9 mm cap sits on it. */
  lightHeightRange: [20, 52] as [number, number],
  walls: {
    w1: {
      length: 121, maxHeight: 61.9, attachAtMax: false,
      plan: { fixed: 'y', at: 150, from: 120.15, dir: -1 },
      features: [
        { kind: 'tab', x0: 1.7, x1: 14.2, y0: 23, y1: 25.2, ...TAB_Z },
        { kind: 'tab', x0: 0.4, x1: 13, y0: 93, y1: 95.2, ...TAB_Z },
      ],
    },
    w2: {
      length: 147, maxHeight: 65.4, attachAtMax: true,
      plan: { fixed: 'x', at: 120, from: 150, dir: -1 },
      features: [
        { kind: 'tab', x0: 52.9, x1: 65.4, y0: 32, y1: 34, ...TAB_Z },
        { kind: 'tab', x0: 52.9, x1: 65.4, y0: 112, y1: 114, ...TAB_Z },
      ],
    },
    w3: {
      length: 147, maxHeight: 65.4, attachAtMax: true,
      plan: { fixed: 'x', at: 0, from: 3, dir: 1 },
      features: [
        { kind: 'tab', x0: 52.9, x1: 65.4, y0: 23, y1: 25, ...TAB_Z },
        { kind: 'tab', x0: 52.9, x1: 65.4, y0: 118, y1: 120, ...TAB_Z },
      ],
    },
    w4: {
      length: 120, maxHeight: 61.9, attachAtMax: false,
      plan: { fixed: 'y', at: 0, from: 0, dir: 1 },
      features: [
        { kind: 'tab', x0: 0, x1: 12.5, y0: 25, y1: 27, ...TAB_Z },
        { kind: 'tab', x0: 0, x1: 12.5, y0: 95, y1: 97, ...TAB_Z },
      ],
    },
  } as Record<WallId, WallSpec>,
};
