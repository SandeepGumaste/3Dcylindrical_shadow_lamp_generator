# Box Inner Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner chose inline execution for this work).

**Goal:** Add an on/off "Inner details" option that cuts openings in the box walls so lit areas inside a dark shape survive.

**Architecture:** A per-wall solid/open cell mask (0.4 mm cells) is built from the rim profile and the shadow image, cleaned for printability, then traced into smooth loops with `extractSmoothLoops` and triangulated with `cdt2d` into a perforated plate; tabs are appended as before.

**Tech Stack:** TypeScript, existing `src/geometry/contours.ts` (`extractSmoothLoops`, `groupShapes`) and `cdt2d`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-box-inner-details-design.md`

## Global Constraints
- Do not edit any Tealight or cylinder-mode file; import `contours.ts` only. All new geometry is pure functions under `src/geometry/box/`.
- Every generated wall must pass `checkMesh` (watertight, positive volume). 0.4 mm grid; foot below `MIN_WALL_HEIGHT` (15 mm from the seat) is always solid.
- Defaults: `innerDetails: true`, minimum spike width 1.2 mm, minimum notch width 0.8 mm.
- With `innerDetails` off the output must be identical to today's walls.

## Review Focus
- A solid-black or blank image: no holes, no crash, same as without the option.
- A lit area enclosing a dark island (eye in a face): the island is bridged or dropped, never left floating.
- Lit areas the wall cannot reach (mapping above the wall or below the minimum): no holes there.
- Image with thousands of tiny lit specks (halftone): time and triangle count stay bounded.
- Corner heights and tabs unchanged by the option.

### Task 1: Shared shadow sampler
**Files:** Modify `src/geometry/box/rimProfile.ts`, `src/geometry/box/__tests__/rimProfile.test.ts`.
**Interfaces:** Produces `RimProfile` gains `rawHeights: Record<WallId, Float32Array>` (clamped heights before spike and notch processing, same layout as `heights`) and `darkAt(X: number, Y: number): boolean` (despeckled shadow mask at wall-plane millimetres from the light axis, y up).
- [ ] Write failing tests: for a disc image `profile.darkAt(0, 0)` is true and `darkAt(400, 400)` false; `rawHeights.w1` has the same length as `heights.w1` and every value is within 0.3 mm of `heights` except where spikes were widened or notches filled (processed >= raw never fails: assert `heights >= rawHeights - 1e-6` is false only for notch filling; assert instead that `rawHeights` equals `heights` for the plain disc within 0.3 mm).
- [ ] Run to verify failure; implement by returning the existing closures and the pre-processing array; run tests; commit.

### Task 2: Plate field (solid or open cells, cleanup, bridging)
**Files:** Create `src/geometry/box/plateField.ts`, `src/geometry/box/__tests__/plateField.test.ts`.
**Interfaces:** Consumes `RimProfile`, `BoxParams`, `KIT`, `rimPoint`, `PROFILE_STEP`. Produces `PLATE_CELL = 0.4`; `interface PlateField { cols: number; rows: number; solid: Uint8Array; report: { openings: number; thickened: number; bridged: number; dropped: number } }` with cells indexed `row * cols + col`, col along the wall's plate y, row = height from the seat; `buildPlateField(id: WallId, profile: RimProfile, p: BoxParams): PlateField`.
- [ ] Failing tests (use a 450 px image, 1 px per mm): (1) a dark annulus of outer radius 140 and inner radius 100 with a lit centre: for `w1` the field has an opening inside the plate (a connected open region fully surrounded by solid cells, not touching the top or the foot); (2) a dark disc of radius 140 with a small lit hole in its middle gives the same hole size within 1 mm; (3) a solid disc gives no openings (`report.openings === 0`); (4) rows below `MIN_WALL_HEIGHT` are solid for every column; (5) an annulus with a dark dot in its lit centre: the dot is an island and `report.bridged + report.dropped >= 1`, and afterwards every solid cell is connected to the foot (flood fill from the foot row reaches all solid cells); (6) a 1 mm wide dark ring stroke around a lit centre is thickened to at least 1.2 mm (`report.thickened >= 1`); (7) openings narrower than 0.8 mm do not exist (every open 4-connected run in rows and columns inside a hole is at least 2 cells wide).
- [ ] Run to verify failure, then implement per the design: cell centre -> `s = from + dir * y` clamped, `h = hs - panelPlaneX`; foot solid; above the processed top open; between raw and processed top solid; else solid iff `profile.darkAt(r cos a, r sin a)` with `r = d (L + T) / (L - h)`; then thicken strokes thinner than `minSpike` (opening of solid by `ceil(minSpike / PLATE_CELL)` squares, add back what the opening removed, dilated), fill openings narrower than `minGap` (opening of the open cells by `ceil(minGap / PLATE_CELL)`), label solid 4-connected components without wrapping, bridge each island to the nearest foot-connected solid along the four axes with a strip `ceil(minSpike / PLATE_CELL)` cells wide (repeat while progress, nearest first), drop islands with no target.
- [ ] Run tests; commit.

### Task 3: Perforated wall mesh
**Files:** Modify `src/geometry/box/wallMesh.ts` (export `addBox`); create `src/geometry/box/perforatedWall.ts`, `src/geometry/box/__tests__/perforatedWall.test.ts`.
**Interfaces:** Consumes `PlateField`, `extractSmoothLoops`, `groupShapes`, `cdt2d`. Produces `generatePerforatedWall(id: WallId, field: PlateField): IndexedMesh` in the same plate frame as `generateWall` (x height from the seat edge, or from `maxHeight` for `attachAtMax`; y length; z thickness) including the tabs.
- [ ] Failing tests: for each wall a field with one rectangular opening gives a mesh with `checkMesh(...).watertight`, `signedVolume > 0`, bbox length `KIT.walls[id].length` within 0.5 and thickness plate plus tab; a vertical ray through the opening centre hits no triangle with an upward normal (the opening is through); a field with no openings has the same volume (within 1 %) as `generateWall` for the same profile; tabs present (same top-face check as `wallMesh.test.ts`).
- [ ] Run to verify failure, then implement: loops of the solid mask in cell units, `groupShapes`, per shape `cdt2d(points, loop edges, { exterior: false })`, top and bottom faces from the triangles with shared vertex ids, side quads along every loop edge facing away from the solid (the solid is to the left of the loop direction), map `(col, row)` to plate `(y, height)` and to plate x (`maxHeight - height` when `attachAtMax`), reverse all windings when the mapping reflects an odd number of times, then add the tabs.
- [ ] Run tests; commit.

### Task 4: Kit integration, option and UI
**Files:** Modify `src/geometry/box/rimProfile.ts` (`BoxParams.innerDetails`, default true), `src/geometry/box/kit.ts`, `src/components/BoxPanel.tsx`, `src/geometry/box/__tests__/kit.test.ts`, `src/hooks/__tests__/useBoxGenerator.test.ts`.
**Interfaces:** `BoxParams.innerDetails: boolean`; `buildKit` uses `generatePerforatedWall(id, buildPlateField(id, profile, p))` when it is on and reports warnings from `PlateField.report`.
- [ ] Failing tests: `inputKey` changes with `innerDetails`; `buildKit` with a ring image and the option on returns walls with more triangles than with it off, still 10 parts, all generated parts watertight; with the option off the wall STL bytes equal the previous generator's output; the warnings mention the bridged and dropped counts when nonzero; a halftone-like noise image finishes in under 15 s and each wall stays under 400,000 triangles.
- [ ] Implement; add a checkbox "Inner details" in `BoxPanel.tsx` under the shadow image group with the hint "Cuts openings in the walls so lit areas inside the shape show. Thin strokes are thickened and floating pieces joined with small bridges."; run the whole suite and `tsc`; commit.

### Task 5: Docs and browser check
- [ ] Update `ARCHITECTURE.md` (the box section: inner details, plate field, perforated wall, the option); run the app, upload `/private/tmp/claude-501/-Users-sandeepgumaste-Documents-GithubRepos-3Dcylindrical-shadow-lamp-generator/0e99c810-2615-415e-9ab4-1597b041f813/images/2.jpg` (the owner's silhouette) as the shadow image with a screenshot of the lit preview with the option on and off; commit.
