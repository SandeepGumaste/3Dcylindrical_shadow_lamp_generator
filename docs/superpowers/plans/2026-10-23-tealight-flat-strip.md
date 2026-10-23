# Tealight Flat Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Flat strip" STL download to Tealight mode: the cone's wall unrolled into a 2-layer sheet with a lockable seam, plus a base ring, in one file.

**Architecture:** Reuse `buildTealightField` unchanged. A new grid step cuts the periodic field at a bar, appends a lock tab, and drops the bottom ~1 mm of rows. A new non-wrapping mode of `buildShell` meshes it into a thin sheet through a developed-cone map. A revolved ring is meshed separately and laid beside it. A new worker request kind runs it on button press.

**Tech Stack:** TypeScript, Vitest (`npm test`), `tsc --noEmit` (`npm run lint`), React + Vite, Web Worker.

**Spec:** `docs/superpowers/specs/2026-10-23-tealight-flat-strip-design.md`

## Global Constraints

- Sheet thickness = `layers * layerHeight`; defaults 2 layers x 0.2 mm = 0.4 mm. Must be <= 1.2 mm or validation fails (it would not bend).
- Existing upright Tealight output and tests must not change. Run `npm test` and `npm run lint` before every commit.
- Pure geometry (no DOM/three.js) so it runs in the worker.
- Every mesh must pass `checkMesh` (watertight, `signedVolume > 0`).
- Flat mode: no LED socket, no vents, no floor plate, no top ring, no rib bumps (rib strips stay as flat bars), `autoRibs` ignored (manual `ribs` used, evenly spaced).
- Constants (put in `src/geometry/flatStrip.ts` as `FLAT`): `tabWidth` 8 mm, `groundMin` 1 mm, `grooveDepth` 2 mm, `grooveClearance` 0.3 mm, `ringWallIn` 1.5 mm, `ringWallOut` 2 mm, `lockRimMin` 5 mm, `bedMax` 250 mm, `bedGap` 5 mm.
- Commits end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## Review Focus

- Cylinder case (`topDiameter == innerDiameter`, taper 0): the strip is a rectangle and stays watertight. Test in Task 5.
- Top wider than bottom (`k > 0`): orientation is still outward-facing (`signedVolume > 0`). Test in Task 5.
- `ribs = 0` (no bars): a seam is still chosen and the mesh is watertight. Test in Task 3.
- LED mode on, or a rim shorter than 5 mm: validation error with a message, not a crash. Test in Task 2.
- Blank white and all-black images: strip is valid and watertight. Test in Task 6.

---

## File Structure

- Modify `src/geometry/shellMesh.ts`: `wrap: false` mode.
- Create `src/geometry/flatStrip.ts`: `FlatStripParams`, `FLAT` constants, validation, params adapter, developed map.
- Create `src/geometry/flatStripGrid.ts`: seam, tab, trim, lock layout (grid level).
- Create `src/geometry/flatRing.ts`: revolved ring mesh.
- Create `src/geometry/flatStripExport.ts`: assembles sheet + ring into one result (`generateFlatStripExport`).
- Modify `src/workers/tealightCompute.ts`, `src/workers/tealightRunner.ts`: `kind: 'flat'`.
- Modify `src/hooks/useTealightGenerator.ts`, `src/components/TealightPanel.tsx`: params, button.
- Tests: `src/geometry/__tests__/{shellMeshWrap,flatStrip,flatStripGrid,flatRing,flatStripExport}.test.ts`, `src/workers/__tests__/tealightCompute.test.ts`.

---

### Task 1: Non-wrapping grid in `buildShell`

**Files:**
- Modify: `src/geometry/shellMesh.ts` (`ShellOptions`, `buildShell`)
- Test: `src/geometry/__tests__/shellMeshWrap.test.ts`

**Interfaces:**
- Produces: `ShellOptions.wrap?: boolean` (default `true`, old behaviour) and `ShellOptions.dTheta?: number`. With `wrap: false`, `spec.cols` is the number of node columns, there are `cols - 1` cell columns, the left and right grid borders get end walls (free edges), and the `theta` passed to the surface maps is `dTheta * i` (`dTheta` required).

- [ ] **Step 1: Write the failing test** in `shellMeshWrap.test.ts`: build a 6 x 4 all-solid field with `wrap: false`, `dTheta: 0.1`, `inner = (th, z) => [th, 0, z]`, `outer = (th, z) => [th, 0.4, z]`; assert `checkMesh` is watertight, `signedVolume` is within 1 % of `5 * 0.1 * 0.4 * (zs[3] - zs[0])` for `zs = [0, 1, 2, 3]`. A second test: a field with one hole in the middle is watertight. A third: the same field with default `wrap` still produces the old closed ring (cell columns = cols).
- [ ] **Step 2: Run** `npx vitest run src/geometry/__tests__/shellMeshWrap.test.ts`. Expected: FAIL (option unknown / not watertight).
- [ ] **Step 3: Implement.** In `buildShell`: `const cellCols = wrap ? C : C - 1`; loop `i < cellCols`; `fAt`/`node`/`hCross`/`vCross` only wrap when `wrap`; vertex theta is `dTheta * i` when not wrapping; in the free-edge test add `side === 3 && i === 0` and `side === 1 && i === cellCols - 1` when not wrapping. `skipTopBorder`/`skipBottomBorder` stay as they are.
- [ ] **Step 4: Run** the new test plus `npx vitest run src/geometry`. Expected: all PASS (existing shell tests unchanged).
- [ ] **Step 5: Commit** `feat: non-wrapping grid mode in buildShell`.

### Task 2: Flat strip params, validation, developed-cone map

**Files:**
- Create: `src/geometry/flatStrip.ts`
- Test: `src/geometry/__tests__/flatStrip.test.ts`

**Interfaces:**
- Produces:
  - `interface FlatStripParams { layerHeight: number; layers: number }`, `DEFAULT_FLAT_STRIP_PARAMS = { layerHeight: 0.2, layers: 2 }`
  - `const FLAT = {...}` (constants listed above)
  - `sheetThickness(fp: FlatStripParams): number`
  - `flatTealightParams(p: TealightParams, fp: FlatStripParams): TealightParams` = `p` with `wallThickness = sheetThickness(fp)`, `closeBottom: false`, `vents: 0`, `autoRibs: false`, `ribAngles: undefined`
  - `validateFlatStrip(p: TealightParams, fp: FlatStripParams): string[]`
  - `developedMap(g: TealightGeometry): (theta: number, z: number) => [number, number]`
- Consumes: `deriveGeometry`, `validateTealightParams`, `TealightGeometry`, `coneRadius` from `tealightShade.ts`.

- [ ] **Step 1: Write failing tests.**
  - `developedMap`: for default params, for 20 sample (theta, z) pairs the distance between adjacent samples (`dTheta = 0.05`) in the plane equals the 3D distance on the cone `hypot(R(z)*(dTheta chord), 0)` within 1e-3 mm; and the distance between (theta, z0) and (theta, z1) equals `(z1 - z0) * sqrt(1 + k^2)` within 1e-6.
  - Cylinder case (`topDiameter = innerDiameter`): `developedMap(g)(theta, z)` equals `[R*(theta - Math.PI), z]` within 1e-9.
  - `validateFlatStrip`: defaults pass (`[]`); `useLed: true` returns an error containing `LED`; `layers: 7` (7 x 0.2 = 1.4 mm, above the 1.2 mm limit) returns an error containing `bend`; `height: 30` with defaults (rim shorter than 5 mm, check by computing the rim from `deriveGeometry`) returns an error containing `rim`.
- [ ] **Step 2: Run** `npx vitest run src/geometry/__tests__/flatStrip.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Developed cone: `sinB = |k| / sqrt(1 + k^2)`, `rho(z) = R(z) / sinB`, angle `psi = (theta - PI) * sinB`; plane point `[rho sin psi, sign * rho cos psi]` where `sign = k > 0 ? 1 : -1` so that +theta runs to +x and +z runs to +y; `|k| < 1e-6` uses the cylinder form. Rim height used by validation = `g.H - g.zs[g.openHi]` (also reuse it in Task 3; export `rimRows(g)` returning the first row index above `openHi`). Validation also requires the solid foot (`g.baseBand0`) minus the ground row height to be >= `FLAT.grooveDepth`, and runs `validateTealightParams(flatTealightParams(p, fp))`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat: flat strip params, validation and developed cone map`.

### Task 3: Strip grid: seam, tab, trimmed foot

**Files:**
- Create: `src/geometry/flatStripGrid.ts`
- Test: `src/geometry/__tests__/flatStripGrid.test.ts`

**Interfaces:**
- Consumes: `buildTealightField`, `ribAngleList`, `FieldReport` (`tealightShade.ts`); `flatTealightParams`, `FLAT`, `rimRows` (Task 2).
- Produces:
  - `chooseSeamColumn(field: Float32Array, g: TealightGeometry, p: TealightParams): number`: column index (0..cols-1). With ribs: the centre column of the rib whose angle is nearest 0 (`round(angle * cols / 2pi) mod cols`). Without ribs: the column with the most solid cells over the pattern rows (`bandStart..bandEnd`), lowest index on ties.
  - `interface StripGrid { geometry: TealightGeometry; cols: number; zs: Float64Array; field: Float32Array; dTheta: number; baseCols: number; tabCols: number; row0: number; floorThickness: number; rimLo: number; report: FieldReport }`
  - `buildStripGrid(img: GrayImage, p: TealightParams, fp: FlatStripParams): StripGrid`: runs `buildTealightField(img, flatTealightParams(p, fp))`; rotates columns so the seam column is column 0; appends `baseCols + 1` as the right end node (a copy of column 0) and then `tabCols = ceil(FLAT.tabWidth / (dTheta * R(rim mid z)))` more columns that continue the rotation; in the tab columns every row below `rimLo` is a hole (`-255`) and rim rows copy the (solid) field; drops rows below `row0` = first row with `zs >= FLAT.groundMin`; `floorThickness = zs[row0]`; `zs` in the result starts at `0` (`zs[j] - zs[row0]`) but `geometry.zs` keeps the real heights. `rimLo` is the first rim row in the trimmed grid.
  - The lock is added in Task 4, not here.

- [ ] **Step 1: Write failing tests.**
  - Seam: default params (ribs 6, angles evenly from 0): `chooseSeamColumn` returns `0`. With `ribs: 4` and `ribAngles: [0.4, 1.9, 3.4, 4.9]` it returns `round(0.4 * cols / (2 * Math.PI))` (the rib at 0.4 rad is nearest 0). With `ribs: 0` it returns the most-solid column and the result of `buildStripGrid` is not empty.
  - Grid: for default params and the Batman sample image from `src/image/tealightSamples` (`TEALIGHT_SAMPLES`), `grid.field[i + cols * j]` equals the upright field at column `(seam + i) % baseCols` and row `row0 + j` for every `i < baseCols`, `j >= 0` (compare against a direct `buildTealightField` call with `flatTealightParams`); the right end column equals column 0; tab columns have `field <= 0` for all rows `< rimLo` and `> 0` for rim rows; `floorThickness >= 1` and `< 2`.
- [ ] **Step 2: Run** `npx vitest run src/geometry/__tests__/flatStripGrid.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as described.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat: strip grid with seam on a bar, lock tab and trimmed foot`.

### Task 4: Seam lock layout (fingers and slits)

**Files:**
- Modify: `src/geometry/flatStripGrid.ts`
- Test: `src/geometry/__tests__/flatStripGrid.test.ts`

**Interfaces:**
- Produces:
  - `interface GridRect { i0: number; i1: number; j0: number; j1: number }` (inclusive grid cells)
  - `interface LockLayout { fingers: GridRect[]; slits: GridRect[] }`
  - `applyLock(grid: StripGrid): LockLayout`: edits `grid.field` in place and appends extra columns for the fingers (grid gains `fingerCols`; update `cols`). Two fingers, one above the other inside the rim rows. A finger is a 3 mm wide, 4 mm long bar extending from the tab's far edge, with an arrow barb 4.4 mm wide at its tip (barb length 1 mm). A slit is a hole 3.4 mm wide in the left end, in the same rows as its finger, positioned so that after rolling (tab column `i` overlays left-end column `i - baseCols`) the finger tip lands over the slit. Slits and fingers live only in rows `>= rimLo`.
  - Call `applyLock` at the end of `buildStripGrid` so `buildStripGrid` always returns a locked grid and exposes `lock: LockLayout` on `StripGrid`.

- [ ] **Step 1: Write failing tests.**
  - All `fingers` and `slits` rects have `j0 >= rimLo`.
  - For each finger `f` with its slit `s`: `f.i1 - baseCols` (tip column, rolled) lies within `[s.i0, s.i1]`.
  - Field in every slit cell is `<= 0`; in every finger cell `> 0`.
  - Outside rows `>= rimLo` the grid is identical to the grid from before `applyLock` (copy the field before, compare the pattern rows).
  - Two fingers do not overlap each other.
- [ ] **Step 2: Run** the test file. Expected: FAIL.
- [ ] **Step 3: Implement.** Lay fingers and slits out in mm using the rim-band mid radius and row heights, then rasterise to grid cells.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: tongue-and-slot seam lock in the top rim band`.

### Task 5: Sheet mesh

**Files:**
- Create: `src/geometry/flatStripExport.ts` (first function only)
- Test: `src/geometry/__tests__/flatStripExport.test.ts`

**Interfaces:**
- Consumes: `buildShell`, `MeshBuilder` (Task 1), `developedMap` (Task 2), `StripGrid` (Task 3, 4).
- Produces: `buildSheetMesh(mb: MeshBuilder, grid: StripGrid, thickness: number): { width: number; height: number }`: meshes the sheet with `buildShell(mb, {cols, zs: realZs, field, inner: (th, z) => [x, y, 0], outer: (th, z) => [x, y, thickness]}, { wrap: false, dTheta: grid.dTheta })` where `[x, y]` come from `developedMap(grid.geometry)` with the real wall height; then translates all vertices of this sheet so its bounding box starts at `(0, 0)`; returns the bounding-box width and height in mm. Where the map would make the faces point the wrong way (checked by test), mirror the sheet in y so `signedVolume > 0`.

- [ ] **Step 1: Write failing tests** (default params, Batman sample): `checkMesh` watertight and `signedVolume > 0` for (a) defaults, (b) cylinder `topDiameter: 44`, (c) top wider `topDiameter: 52`; `z` of all vertices within `[0, 0.4 + 1e-6]`; strip width for the default is within 1 % of `2 * PI * R(0)` plus the tab and finger arc (check `width > 2 * Math.PI * 22 * 0.95`).
- [ ] **Step 2: Run** `npx vitest run src/geometry/__tests__/flatStripExport.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `buildSheetMesh`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: flat sheet mesh from the strip grid`.

### Task 6: Ring and the combined export

**Files:**
- Create: `src/geometry/flatRing.ts`
- Modify: `src/geometry/flatStripExport.ts`
- Test: `src/geometry/__tests__/flatRing.test.ts`, `src/geometry/__tests__/flatStripExport.test.ts`

**Interfaces:**
- Produces:
  - `interface RingSpec { grooveRadius: number; sheetThickness: number; floor: number }`
  - `buildRingMesh(mb: MeshBuilder, spec: RingSpec, segments?: number): { outerRadius: number; height: number }`: revolved profile around the z axis centred at `(0, 0)`, bottom on `z = 0`: groove width `sheetThickness + FLAT.grooveClearance` centred on `grooveRadius`, depth `FLAT.grooveDepth`, floor under the groove `floor`, wall `FLAT.ringWallIn` inside the groove and `FLAT.ringWallOut` outside, total height `floor + FLAT.grooveDepth`. Default `segments = 360`.
  - `interface FlatStripResult { positions: Float32Array; indices: Uint32Array; triangleCount: number; check: MeshCheck; warnings: string[]; ms: number; stripWidth: number; stripHeight: number; ringDiameter: number; report: FieldReport }`
  - `generateFlatStripExport(img: GrayImage, p: TealightParams, fp: FlatStripParams, runChecks = true): FlatStripResult`: throws `Error(errors.join(' '))` when `validateFlatStrip` fails; builds the grid, sheet and ring (groove radius = `R(zs[row0]) + thickness / 2`, using the geometry's real height at the bottom edge; floor = `grid.floorThickness`); places the ring beside the strip: ring centre at `x = stripWidth + FLAT.bedGap + outerRadius`, `y = outerRadius`; warnings: islands (same wording as `generateTealightShade`), dropped specks, `strip is wider/taller than 250 mm`.
- Consumes: Tasks 1 to 5, `MeshBuilder`, `checkMesh`.

- [ ] **Step 1: Write failing tests.**
  - Ring: `checkMesh` watertight, `signedVolume` within 0.5 % of `PI * (rOut^2 - rIn^2) * (floor + depth) - PI * (rg2^2 - rg1^2) * depth` for `spec = { grooveRadius: 22.2, sheetThickness: 0.4, floor: 1.1 }`.
  - Export: defaults + Batman image is watertight with `signedVolume > 0`; ring bounding box is disjoint from the strip bounding box (min x of ring vertices > `stripWidth`); `stripHeight` is within 0.1 mm of `H - floorThickness`; layout fits `FLAT.bedMax` for defaults (no bed warning); with `innerDiameter: 200, topDiameter: 190, height: 42` the bed warning appears.
  - Blank white image (`pixels` all 255) and all black image (all 0), both 64 x 64: each yields watertight meshes.
  - Shadow equivalence: for defaults, rolled-strip pattern equals the upright pattern: for 200 random-ish `(i, j)` pairs in the pattern band the strip's `field` sign equals the sign of the upright `buildTealightField(img, flatTealightParams(p, fp))` field at `((seam + i) % baseCols, row0 + j)`.
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement** `buildRingMesh` (revolve a closed (r, z) profile, outward normals) and `generateFlatStripExport`.
- [ ] **Step 4: Run** `npx vitest run src/geometry`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: base ring and combined flat strip export`.

### Task 7: Worker request kind `flat`

**Files:**
- Modify: `src/workers/tealightCompute.ts`, `src/workers/tealightRunner.ts`, `src/workers/tealight.worker.ts` (transfer list unaffected; check)
- Test: `src/workers/__tests__/tealightCompute.test.ts`

**Interfaces:**
- Consumes: `generateFlatStripExport`, `FlatStripParams` (Task 6).
- Produces: `TealightRequest` gains `{ kind: 'flat'; image: GrayImage; params: TealightParams; flat: FlatStripParams }`; `TealightOutput.kind` gains `'flat'`; for `'flat'` the output has `positions`, `indices`, `triangleCount`, `stl` (`indexedMeshToBinarySTL(..., 'Tealight Flat Strip')`), `check`, `warnings`, `ms`, and `lightZ: 0`, `topZ: 0`, `groundRadius: params.shadowRadius` (unused). The runner keeps one active worker per request-kind group (`'flat'` separate from `'tealight' | 'bowl'`) so a flat run never cancels an upright run.

- [ ] **Step 1: Write failing test**: `runTealightRequest({ kind: 'flat', image: <64x64 gray sample>, params: DEFAULT_TEALIGHT_PARAMS, flat: DEFAULT_FLAT_STRIP_PARAMS })` returns `kind === 'flat'`, `check.watertight === true`, `stl.byteLength === 84 + 50 * triangleCount`; and with `useLed: true` it throws an error whose message contains `LED`.
- [ ] **Step 2: Run** `npx vitest run src/workers/__tests__/tealightCompute.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the compute branch and the per-group `active` workers in the runner.
- [ ] **Step 4: Run** `npm test` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: flat strip request in the tealight worker`.

### Task 8: Hook and panel

**Files:**
- Modify: `src/hooks/useTealightGenerator.ts`, `src/components/TealightPanel.tsx`
- Test: `src/hooks/__tests__/flatStrip.test.ts`

**Interfaces:**
- Produces in `useTealightGenerator`: state `flatParams: FlatStripParams` (default `DEFAULT_FLAT_STRIP_PARAMS`), `setFlat(patch: Partial<FlatStripParams>)`, `flatBusy: boolean`, `flatError: string | null`, `downloadFlat(): Promise<void>`: validates (`validateFlatStrip`), runs `runTealight({ kind: 'flat', ... })`, shows `flatError` for validation errors or a non-watertight mesh (no download), otherwise `downloadSTL(result.stl, \`tealight-flat-strip-${imageName}-${date}.stl\`)`; warnings from the result are kept in `flatWarnings: string[]`.
- Panel (tealight mode only): a "Flat strip (print flat, 2 layers)" group with number inputs for Layer height (mm) and Layers, a sheet thickness readout, and a "Flat strip STL" button next to the SVG button, disabled while `flatBusy` or when the image is missing; `flatError` and `flatWarnings` shown in the same style as the existing warnings.

- [ ] **Step 1: Write failing test** in `src/hooks/__tests__/flatStrip.test.ts` (follow `useBoxGenerator.test.ts` for how hooks are tested here): `validateFlatStrip`-backed `flatError` appears for `useLed: true` and no download is called; for defaults a stubbed `runTealight` returning a watertight result triggers `downloadSTL` once with a filename starting `tealight-flat-strip-`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** the hook additions and the panel group.
- [ ] **Step 4: Run** `npm test` and `npm run lint`. Expected: PASS. Then start the app with the `run` skill, open Tealight mode, press "Flat strip STL" and confirm a file downloads and the layout shows strip and ring side by side (open the STL in the viewer or a slicer if available).
- [ ] **Step 5: Commit** `feat: flat strip download in the tealight panel`.

---

## Self-review

- Spec coverage: strip unroll (T2, T5), 2-layer thickness and limit (T2), ring in same export (T6), seam on a bar and rim-band lock (T3, T4), foot butt joint (T3 has no foot tab), same shadow by trimming the bottom 1 mm (T3, T6 equivalence test), rib bars without bump (T2 adapter, T5 mesh has no bumps), compute on button press (T7, T8), warnings and watertight block (T6, T8), LED unsupported (T2).
- Types: `StripGrid`, `LockLayout`, `FlatStripParams`, `FlatStripResult`, `RingSpec` are defined once and used consistently.
- Proportion: plan states signatures, tests and values only; bodies are left to the implementer.
