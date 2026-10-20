# Shadow wall mode Implementation Plan

> Spec: `docs/superpowers/specs/2026-10-20-shadow-wall-mode-design.md` (read it first; it is the authority). Execute with superpowers:subagent-driven-development. Test-first; run the focused test while iterating and the full `npx vitest run` + `npx tsc --noEmit` once before each commit. Never use Playwright or any browser (the owner does frontend checks). Do not push.

**Architecture:** a new module `src/geometry/shadowWall/` (pure geometry, no DOM) reusing `buildShell`/`MeshBuilder` (`src/geometry/shellMesh.ts`), `checkMesh` (`meshCheck.ts`), `labelComponents` (periodic, exported from `tealightShade.ts`), `sampleBilinear` (`src/image/sampling.ts`); `gaussianBlur` in `tealightShade.ts` becomes exported (Task 2). Worker, hook, panel and the viewer mirror Tealight's.

## Global constraints
- Match the surrounding code style (comment density, naming, 2-space, single quotes). Units mm. z up, table at z = 0, light at (0, 0, hf).
- Pure functions with explicit params; no hidden globals. Every public function has a test.
- `GrayImage` is `{ width, height, pixels: Float32Array }` (0 = black, 1 = white), from `src/types`.

### Task 1: Footprint outline
**Files:** create `src/geometry/shadowWall/footprint.ts`, `src/geometry/shadowWall/__tests__/footprint.test.ts`.
**Interface:**
```ts
export type FootprintKind = 'rectangle' | 'ellipse';
export interface FootprintParams { kind: FootprintKind; width: number; length: number; cornerRadius: number; wallThickness: number; cellSize?: number }
export interface Outline {
  cols: number;                 // samples around the perimeter, uniform in arc length (60..2400)
  perimeter: number;            // mm
  px: Float64Array; py: Float64Array;   // outer points
  nx: Float64Array; ny: Float64Array;   // unit outward normals
  qx: Float64Array; qy: Float64Array;   // inner points = p - wallThickness * n
  dOut: Float64Array; dIn: Float64Array; // distances of p and q from the centre (0, 0)
}
export function buildOutline(p: FootprintParams): Outline;
```
Rectangle: `width` (x) by `length` (y), centred on (0,0), corners rounded with `cornerRadius` (clamped to min(width, length)/2); ellipse: semi-axes width/2 and length/2, arc-length parametrised numerically. Sample 0 is at angle 0 (+x axis, on the right-hand side) and samples run counter-clockwise. cols = clamp(round(perimeter / (cellSize ?? 0.4)), 60, 2400).
- [ ] Tests first: perimeter of a 100x60 rectangle with radius 10 equals 2(100-20)+2(60-20)+2*pi*10 within 0.5 %; ellipse perimeter within 0.5 % of Ramanujan's; consecutive samples are evenly spaced within 2 %; normals are unit and point outward (p . n > 0 for shapes centred on the origin); inner points lie exactly wallThickness inside (distance from the outline equals t); samples are counter-clockwise (signed area > 0); sample 0 sits at (width/2, 0); cols is clamped; a circle (ellipse with equal axes) has dOut constant.
- [ ] Implement, run, commit `feat: footprint outline for the shadow wall`.

### Task 2: Parameters, validation, rows and the field
**Files:** create `src/geometry/shadowWall/shadowWall.ts` (params, defaults, validation, `deriveGeometry`, `buildField`), `src/geometry/shadowWall/__tests__/field.test.ts`; modify `src/geometry/tealightShade.ts` (export `gaussianBlur`).
**Interface:**
```ts
export interface ShadowWallParams extends FootprintParams {
  height: number;        // total wall height, default 70
  lightHeight: number;   // hf, default 90
  shadowSize: number;    // mm width of the image canvas on the table at 100 %, default 400
  imageScale: number;    // %, default 100
  rotation: number;      // degrees, default 0
  offsetX: number; offsetY: number; // mm, default 0
  threshold: number;     // 0..255, default 128
  edgeRounding: number;  // 0..40, default 10 (blur radius = value / 10 grid pixels)
  invert: boolean;       // default false: dark pixels are shadow (solid)
  minFeature: number;    // mm, default 0.8
}
export const DEFAULT_SHADOW_WALL_PARAMS: ShadowWallParams;  // kind 'rectangle', width 80, length 80, cornerRadius 10, wallThickness 1.2
export const FOOT = 3, RIM = 2;
export function validateShadowWallParams(p: ShadowWallParams): string[];
export interface ShadowWallGeometry { outline: Outline; zs: Float64Array; footRows: number; bandStart: number; bandEnd: number; rimStart: number; blendBottom: number; blendTop: number }
export function deriveGeometry(p: ShadowWallParams): ShadowWallGeometry;
export interface ShadowWallField { geometry: ShadowWallGeometry; field: Float32Array; /* cols * zs.length, index i + cols*j, > 0 solid */ report: { specksRemoved: number; floatingRemoved: number } }
export function buildField(img: GrayImage, p: ShadowWallParams): ShadowWallField;
```
Rows per the spec (foot uniform at ~cell, adaptive band, uniform rim). `bandStart`/`bandEnd` are the first and last node rows of the pattern band (z from FOOT to height - RIM), `rimStart` the first rim row. Table position of node (i, j): `qx[i] * hf / (hf - z)`, `qy[i] * hf / (hf - z)`; image sampling: shift by the offsets, rotate by -rotation, divide by mm-per-pixel k = shadowSize * imageScale / 100 / max(width, height), pixel = (width / 2 + X / k - 0.5, height / 2 - Y / k - 0.5) with bilinear sampling (outside the canvas = white). Field = (threshold - blurred * 255) in the dark-is-solid convention, flipped by `invert`; foot and rim rows forced to +255. Specks: flip holes and solids below the `minFeature` disc area (periodic labelling, node area from the local cell sizes; components touching the foot or rim rows are exempt as in Tealight). Floating solid components (not connected to a foot or rim row) are set to hole and counted.
- [ ] Tests first: defaults validate clean; each validation message fires (tiny width, radius too large/small, height >= lightHeight, no room for foot + rim + 5, negative sizes, ellipse axes); rows strictly increase from 0 to height, with foot rows uniform, rim rows uniform and the band count within 1500; table-position step per row never exceeds 1.5 cells at any column (sample 20 columns); a centred dark disc image gives a solid patch and light elsewhere, foot and rim all solid; `invert` swaps solid and hole in the band; a dark pixel outside the canvas scale (tiny imageScale) leaves the band open; offsets and rotation move the solid patch the right way (rotation 90 moves a patch on +x to +y, offsetX moves it by the same mm at the wall's table position); an isolated dark blob that maps to the middle of the band with no connection is removed and counted; the blur setting widens soft edges (a hard-edged disc at edgeRounding 0 vs 40 gives a different node count above 0).
- [ ] Implement, run, commit `feat: shadow wall parameters, rows and field`.

### Task 3: The mesh
**Files:** modify `src/geometry/shadowWall/shadowWall.ts` (add `generateShadowWall`), create `src/geometry/shadowWall/__tests__/mesh.test.ts`.
**Interface:**
```ts
export interface ShadowWallResult { positions: Float32Array; indices: Uint32Array; triangleCount: number; geometry: ShadowWallGeometry; field: Float32Array;
  report: FieldReportLike & { check: MeshCheck; warnings: string[]; ms: number } }
export function generateShadowWall(img: GrayImage, p: ShadowWallParams, runChecks = true): ShadowWallResult;
```
Build with `buildShell(mb, { cols, zs, field, inner, outer }, {})` (periodic in u): `inner(u, z)` is the inner outline point `q` at index round(u * cols / (2 pi))... use the grid index convention `buildShell` already uses for `theta` (read `src/geometry/shellMesh.ts` and the Tealight call in `generateTealightShade` first: `inner/outer` take `(theta, z)` with theta = 2 pi i / cols; map theta to the sample i). Outer map: outer point `p` at height `zo = hf - (hf - z) * dOut / dIn`, blended to z over the foot (weight z / blendBottom for z < blendBottom) and the rim (weight (height - z) / (height - blendTop) above blendTop), as `outerHeight` in tealightShade. Validation (in `validateShadowWallParams`, after the cheap checks): the outer height map is strictly increasing in z at every column (sample 200 heights). Warnings: the specks count, the floating pieces removed, and "Parts of the image that fall outside the wall's reach are open" when the image has dark pixels that no wall point maps to. The top and bottom border rows are all solid (foot, rim): use the same open-edge options Tealight uses for the border handling (read how `generateTealightShade` passes `skipTopBorder`/`skipBottomBorder`; closed top and bottom here, i.e. do not skip).
- [ ] Tests first: a disc image makes a watertight, positive-volume mesh (checkMesh) for rectangle and ellipse; triangle count below 1.5 million at defaults; the mesh bounding box equals the footprint (width x length) and height; the inner surface is exactly wallThickness inside the outer one at the foot; a straight ray from the light through a hole's inner centre also passes through the outer hole (check one hole: sample the field hole centre at (i, j), the outer point's z follows the ray formula); a blank (all white) image gives only the foot and rim (and a warning that nothing is shadowed); a full black image gives a closed solid shell.
- [ ] Implement, run, commit `feat: shadow wall mesh`.

### Task 4: Compute, worker, runner and hook
**Files:** create `src/workers/shadowWallCompute.ts`, `shadowWall.worker.ts`, `shadowWallRunner.ts`, `src/hooks/useShadowWallGenerator.ts`, `src/hooks/__tests__/shadowWall.test.ts`, `src/workers/__tests__/shadowWallCompute.test.ts`.
Mirror `tealightCompute.ts`, `tealight.worker.ts`, `tealightRunner.ts`, `useTealightGenerator.ts` (read them first). The output: `positions, indices, triangleCount, stl, check, warnings, ms, lightZ = hf, topZ = height, groundRadius = shadowSize * imageScale / 200`. The hook exposes `params`, `setParams(patch)`, `errors`, image selection (the same `BUNDLED_IMAGES` ids/names as Tealight; selecting one does NOT touch Tealight's settings; the default is `batman`), upload, `result`, `busy`, `stale`, `runError`, `generate`, `download` (file name `shadow-wall-<image>-<date>.stl`), `reset`. Generate on first load and on image change only (use the same `isStale`-style key rule as the Box hook: read `useBoxGenerator.ts`).
- [ ] Tests first: compute returns a watertight STL buffer whose length is 84 + 50 * triangleCount; `shouldGenerate`/`isStale`-style helpers behave as in Box; the hook's default image is Batman and its default params validate clean (test the exported pure helpers, not React).
- [ ] Implement, run, commit `feat: shadow wall compute, worker and hook`.

### Task 5: Panel, tab and docs
**Files:** create `src/components/ShadowWallPanel.tsx`; modify `src/App.tsx` (a mode `'wall'`, tab label "Shadow wall (table)", the panel, the `TealightViewport` with the hook's result), `ARCHITECTURE.md` (a "Shadow wall mode" section: files, geometry, cleanup, parked items).
Read `src/components/BoxPanel.tsx` and `TealightPanel.tsx` first and reuse their small building blocks (`Num`, `Check`, `Group`) by exporting them from one of those files only if they are already exported; otherwise copy the minimal versions locally. Panel groups: Image (presets + upload, threshold, edge rounding, invert with the hint "Dark = shadow"), Footprint (rectangle/ellipse buttons, width, length, corner radius disabled for ellipse), Wall (thickness, height, light height), Shadow (size, image size %, rotation, offset X/Y), Printability (minimum feature). Same footer pattern as Tealight (errors, status, Generate, STL button). No new dependencies.
- [ ] Verify with `npx tsc --noEmit` and the full suite; add a small render-free test only if the panel has pure helpers. Commit `feat: shadow wall panel and tab`.
