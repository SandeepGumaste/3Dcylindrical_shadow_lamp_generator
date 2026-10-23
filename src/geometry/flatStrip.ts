/**
 * Flat strip export for the Tealight shade: the cone's wall unrolled into a thin sheet (two printed layers) that
 * bends back into the cone. This file holds the parameters, validation and the unrolling map; the grid, the mesh and
 * the ring live next to it. Pure functions only (no DOM / three.js).
 */
import { TealightParams, TealightGeometry, LED_CLEARANCE, LIP_WIDTH, coneRadius, deriveGeometry, validateTealightParams } from './tealightShade';

export interface FlatStripParams {
  layerHeight: number; // mm
  layers: number;      // sheet thickness = layers * layerHeight
}

export const DEFAULT_FLAT_STRIP_PARAMS: FlatStripParams = { layerHeight: 0.2, layers: 2 };

export const FLAT = {
  tabWidth: 8,            // mm, lock tab at the right end (top rim band only)
  groundMin: 1,           // mm of the upright wall's bottom the ring floor stands in for
  grooveDepth: 1.5,       // mm
  grooveClearance: 0.3,   // mm added to the sheet thickness for the ring groove
  ringWallIn: 1.5,        // mm of ring inside the groove
  ringWallOut: 2,         // mm of ring outside the groove
  lockRimMin: 5,          // mm, top rim band height the lock needs
  bedMax: 250,            // mm, warn above this
  bedGap: 5,              // mm between strip and ring on the bed
  maxSheet: 1.2,          // mm, thicker sheets do not bend
  socketClearance: 0.3,   // mm the seam lock stays below the LED socket ring's groove
} as const;

export const sheetThickness = (fp: FlatStripParams) => fp.layers * fp.layerHeight;

/** The Tealight params the flat path runs the pattern with: thin wall, none of the upright-only extras. */
export function flatTealightParams(p: TealightParams, fp: FlatStripParams): TealightParams {
  return { ...p, wallThickness: sheetThickness(fp), closeBottom: false, vents: 0, autoRibs: false, ribAngles: undefined };
}

/** First node row strictly inside the top rim band (the rows above `openHi`, which are forced solid). */
export const rimRows = (g: Pick<TealightGeometry, 'openHi'>) => g.openHi + 1;

/** Top of the seam lock: the strip's top edge, or in LED mode the underside of the socket ring's groove. */
export const lockZMax = (g: Pick<TealightGeometry, 'H'>, p: Pick<TealightParams, 'useLed'>) =>
  p.useLed ? g.H - FLAT.grooveDepth - FLAT.socketClearance : g.H;

/** First grid row at or above `FLAT.groundMin`: the strip starts there, the ring floor fills what is below. */
export const groundRow = (g: Pick<TealightGeometry, 'zs'>) => {
  const j = Array.from(g.zs).findIndex((z) => z >= FLAT.groundMin - 1e-9);
  return j < 0 ? g.zs.length - 1 : j;
};

export function validateFlatStrip(p: TealightParams, fp: FlatStripParams): string[] {
  const e: string[] = [];
  if (!(fp.layerHeight > 0) || !(fp.layers >= 1)) e.push('Layer height and layers must be positive.');
  else if (sheetThickness(fp) > FLAT.maxSheet) e.push(`Sheet thicker than ${FLAT.maxSheet} mm will not bend; use fewer or thinner layers.`);
  if (e.length) return e;
  const tp = flatTealightParams(p, fp);
  const base = validateTealightParams(tp);
  if (base.length) {
    // the upright wording talks about auto ribs; the flat path always uses the Support Ribs number
    return base.map((m) => (/ribs/i.test(m) ? 'Flat strip uses the Support Ribs number (at least 3 when there is an open band above or below the pattern).' : m));
  }
  const g = deriveGeometry(tp);
  if (p.useLed) {
    const lipR = (p.tealightDiameter + LED_CLEARANCE) / 2 - LIP_WIDTH;
    const rSkirt = coneRadius(g.Rb, g.k, g.H) - 0.15 - FLAT.ringWallIn; // inner skirt of the socket ring's groove
    if (rSkirt < lipR + 0.2)
      e.push('Top Diameter is too small for the LED socket ring groove; widen the top or use a smaller tealight diameter.');
  }
  const rim = lockZMax(g, p) - g.zs[rimRows(g) - 1];
  if (rim < FLAT.lockRimMin)
    e.push(`Top rim is ${rim.toFixed(1)} mm; the seam lock needs ${FLAT.lockRimMin} mm. Raise Height or lower Shadow Radius.`);
  if (g.baseBand0 - g.zs[groundRow(g)] < FLAT.grooveDepth)
    e.push('Solid foot is too short for the ring groove; increase the foot band.');
  return e;
}

/**
 * Developed (unrolled) cone: (theta, z) on the inner cone to a point in the plane, arc lengths preserved. +theta runs
 * to +x and +z to +y. A cylinder (no taper) is a plain rectangle.
 */
export function developedMap(g: Pick<TealightGeometry, 'Rb' | 'k'>): (theta: number, z: number) => [number, number] {
  const { Rb, k } = g;
  if (Math.abs(k) < 1e-6) return (theta, z) => [Rb * (theta - Math.PI), z];
  const sinB = Math.abs(k) / Math.sqrt(1 + k * k);
  const sign = k > 0 ? 1 : -1;
  return (theta, z) => {
    const rho = coneRadius(Rb, k, z) / sinB;
    const psi = (theta - Math.PI) * sinB;
    return [rho * Math.sin(psi), sign * rho * Math.cos(psi)];
  };
}
