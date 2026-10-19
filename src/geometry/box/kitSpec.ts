/**
 * Measured constants of the owner's 120 x 150 mm shadow-box kit (battery-box version), taken from
 * the original STLs with scripts/measure-kit.ts. All lengths in mm.
 *
 * Plan frame ("tray frame"): x across the 120 mm width, y along the 150 mm length, seen from the
 * front, y up. The keyhole recess and the lamp-post socket sit towards y = 150 (the top).
 * Height axis: distance above the tray rim, which is where the wall plates and the panel start.
 * Wall frame: x is the plate's height direction, y its length, z through the 3 mm plate.
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
  /** Panel top and the walls' seating edge are level with the tray rim, 20 mm above the mounting wall. */
  T: 20,
  panelPlaneX: 0,
  /** Picture panel: a plate with the picture raised to one of two heights inside a plain border. */
  panel: { w: 113.9, h: 143.9, plate: 3, border: 1.4, lightTop: 3.5, darkTop: 4 },
  post: { length: 60, floorZ: 3 },
  /** Centre of the post socket, which is also the centre of the keyhole recess. */
  lightAxis: { x: 60, y: 117.9 },
  /** LED height above the panel, limited by the 60 mm post standing on the tray floor. */
  lightHeightRange: [20, 43] as [number, number],
  walls: {
    w1: {
      length: 121, maxHeight: 61.9, attachAtMax: false,
      plan: { fixed: 'y', at: 150, from: 0, dir: 1 },
      features: [
        { kind: 'tab', x0: 1.7, x1: 14.2, y0: 23, y1: 25.2, ...TAB_Z },
        { kind: 'tab', x0: 0.4, x1: 13, y0: 93, y1: 95.2, ...TAB_Z },
      ],
    },
    w2: {
      length: 147, maxHeight: 65.4, attachAtMax: true,
      plan: { fixed: 'x', at: 120, from: 1.5, dir: 1 },
      features: [
        { kind: 'tab', x0: 52.9, x1: 65.4, y0: 32, y1: 34, ...TAB_Z },
        { kind: 'tab', x0: 52.9, x1: 65.4, y0: 112, y1: 114, ...TAB_Z },
      ],
    },
    w3: {
      length: 147, maxHeight: 65.4, attachAtMax: true,
      plan: { fixed: 'x', at: 0, from: 1.5, dir: 1 },
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
