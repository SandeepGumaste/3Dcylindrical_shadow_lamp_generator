export interface TealightParams {
  threshold: number;        // 0..255 on luminance
  edgeRounding: number;     // blur before threshold; sigma = edgeRounding / 10 grid cells
  invert: boolean;
  innerDiameter: number;    // mm, bottom
  topDiameter: number;      // mm
  height: number;           // mm
  wallThickness: number;    // mm
  cols: number;             // columns around
  flameHeight: number;      // mm, ignored in LED mode
  shadowRadius: number;     // mm, radius of the image disk on the table
  imageOffsetX: number;     // mm, shifts the image on the table (+x right); moves the light relative to the image
  imageOffsetY: number;     // mm, (+y up)
  imageScale: number;       // % of the shadow disk the image's shorter side spans (100 = fills it)
  patternGapTop: number;    // mm of open band (a ring cut-out) just above the pattern, below a solid rim; 0 = none
  patternGapBottom: number; // mm of open band just below the pattern, above the solid foot; 0 = none
  ribs: number;             // 0 = off
  ribWidth: number;         // mm
  autoRibs: boolean;        // choose the rib count automatically so no roof spans more than maxBridge
  maxBridge: number;        // mm, longest unsupported horizontal span the printer can bridge
  ribAngles?: number[];     // explicit rib positions (rad); set by the optimizer, overrides even spacing of `ribs`
  vents: number;            // 0 = off
  closeBottom: boolean;     // solid floor plate under the shade (needs vents = 0)
  floorThickness: number;   // mm, floor plate thickness when closeBottom is on
  ventSize: number;         // mm
  useLed: boolean;
  tealightDiameter: number; // mm
  bodyHeight: number;       // mm
  ledTipHeight: number;     // mm
  minFeature: number;       // mm, 0 = off: drop holes / loose solid specks smaller than this
  autoBridge: boolean;      // bridge unsupported solid islands to the nearest anchored material
}

export const DEFAULT_TEALIGHT_PARAMS: TealightParams = {
  threshold: 128,
  edgeRounding: 10,
  invert: false,
  innerDiameter: 60,
  topDiameter: 40,
  height: 70,
  wallThickness: 0.8,
  cols: 480,           // ~0.4 mm per column at the foot: matches a 0.4 mm nozzle
  flameHeight: 25,
  shadowRadius: 150,
  imageScale: 100,
  imageOffsetX: 0,
  imageOffsetY: 0,
  patternGapTop: 0,
  patternGapBottom: 0,
  ribs: 6,
  ribWidth: 2,
  autoRibs: true,
  maxBridge: 8,
  vents: 0,
  closeBottom: true,
  floorThickness: 0.4,
  ventSize: 8,
  useLed: false,
  tealightDiameter: 38,
  bodyHeight: 16,
  ledTipHeight: 10,
  minFeature: 0.8,     // two nozzle widths; smaller holes/specks will not print on a 0.4 mm nozzle
  autoBridge: true,
};

export const LED_CLEARANCE = 0.4;
