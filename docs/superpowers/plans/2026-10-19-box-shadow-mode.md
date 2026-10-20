# Box Shadow Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Box shadow mode that turns a silhouette image and a panel picture into a complete printable 120 × 150 mm wall shadow-box kit, without changing Tealight shade mode.

**Architecture:** Pure geometry in `src/geometry/box/` (rim-height maths, wall and panel meshes, kit assembly, store-only zip), run in a web worker that mirrors the tealight worker, with a new hook, panel and viewer wired in as a second mode in `App.tsx`. The four walls and the picture panel are generated; the tray, post, cap, hook and covers are the owner's STLs bundled under `public/box-kit/` and exported unchanged apart from a rigid move to the origin.

**Tech Stack:** TypeScript, React 19, three.js, Vite, Vitest. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-19-box-shadow-mode-design.md`

## Global Constraints

- Box size is fixed at **120 × 150 mm**; other sizes and the rechargeable (Type-C) electronics are out of scope.
- Geometry is pure functions in `src/geometry/`, with no DOM or three.js, so it runs in the worker. Output is binary STL; every generated mesh must pass `checkMesh` (watertight).
- Nothing in Tealight shade mode may change: no edits to `tealightShade.ts`, `tealightCompute.ts`, `tealight*.ts` workers, `useTealightGenerator.ts`, `TealightPanel.tsx`, `TealightViewport.tsx` or `TableInset.tsx`. The only existing file that may change is `src/App.tsx` (add the mode), plus `ARCHITECTURE.md`.
- Bundled parts are never reshaped. Moving one to a common origin is allowed. The generated panel is not bundled and `research/` is not committed.
- Panel: 3 mm plate (z 0 to 3.0) with the picture raised to 3.5 and 4.0 mm (three heights), about 500k triangles at most. Dark tones map to the highest step.
- Defaults: minimum spike width **1.2 mm**, minimum hole or slit **0.8 mm**, light height near the top of the 60 mm post's range, shadow size about three times the box.
- Shadow formula: `r = d · (L + T) / (L − h)` (`d` horizontal distance from the light axis to the rim point, `h` rim height above the panel plane, `L` LED height above the panel, `T` panel to mounting wall). Only star-shaped silhouettes are reproduced and the UI says so.
- Same interaction rules as tealight: generate on first load and when an image changes; setting changes only show the out-of-date banner. Copy is plain, sentence case.

## Review Focus

- A blank (all white or all black) shadow image: expect no crash, a clear message, and the walls at the minimum height.
- A silhouette that reaches past the shadow frame, or a size the light height cannot reach: expect the size clamped with a warning, never a crash or a NaN mesh.
- Single-pixel noise around the silhouette: expect it removed or widened to the minimum spike width, not hundreds of fragile spikes.
- A panel picture that is one flat tone, or very large: expect a valid plate and a triangle count within the budget.
- An asymmetric silhouette: expect adjacent walls to share the same top-edge height at every corner.

## File Structure

| File | Responsibility |
|---|---|
| `src/geometry/box/stlParse.ts` | Parse binary STL into indexed mesh; move to origin |
| `src/geometry/box/kitSpec.ts` | Measured constants of the kit (dimensions, tab positions, light and wall geometry) |
| `src/geometry/box/kitParts.ts` | Manifest of bundled parts and the tray and cover choice |
| `src/geometry/box/shadowModel.ts` | Rim position to direction, reach and wall-height maths |
| `src/geometry/box/rimProfile.ts` | Image to top-edge height profile for all four walls, with thin-feature handling and warnings |
| `src/geometry/box/wallMesh.ts` | One wall: plate, profile edge, tabs |
| `src/geometry/box/panelMesh.ts` | Picture panel relief |
| `src/geometry/box/zip.ts` | Store-only zip writer |
| `src/geometry/box/kit.ts` | Builds all parts and the assembled preview mesh |
| `src/workers/boxCompute.ts`, `box.worker.ts`, `boxRunner.ts` | Worker pipeline mirroring tealight |
| `src/hooks/useBoxGenerator.ts` | State, two images, generate and stale rules |
| `src/components/BoxPanel.tsx`, `BoxViewport.tsx` | Controls and the 3D preview |
| `public/box-kit/*.stl` | The bundled owner parts |

---

### Task 1: Tealight regression pin, STL parsing and bundled parts

**Files:**
- Create: `src/geometry/__tests__/tealightRegression.test.ts`, `src/geometry/box/stlParse.ts`, `src/geometry/box/kitParts.ts`, `src/geometry/box/__tests__/stlParse.test.ts`
- Create (copy): `public/box-kit/tray-2aa.stl` (`obj_12_2AA`), `tray-2aaa.stl` (`obj_11_2AAA`), `lamp-post.stl` (`obj_10_灯柱9.9`), `lamp-cap.stl` (`obj_6_灯帽`), `wall-hook.stl` (`obj_7_墙上挂钩`), `cover-2aaa.stl` (`obj_8_电池盖`), `cover-2aa.stl` (`obj_9_2AA电池盖子`), from `research/索隆投影灯（电池盒版）墙面拆分版++_stls/`

**Interfaces:**
- Produces: `interface IndexedMesh { positions: Float32Array; indices: Uint32Array }`; `parseBinaryStl(buf: ArrayBuffer): IndexedMesh`; `moveToOrigin(m: IndexedMesh): IndexedMesh`; `type TrayId = '2AA' | '2AAA'`; `interface BundledPart { id: string; file: string; label: string }`; `bundledPartsFor(tray: TrayId): BundledPart[]` (tray, post, cap, hook, and the cover for that tray).

- [ ] **Step 1: Write the regression pin first.** `tealightRegression.test.ts` runs `generateTealightShade(TEALIGHT_SAMPLES[0].make(256), DEFAULT_TEALIGHT_PARAMS)` and asserts `triangleCount`, `check.watertight === true`, and an FNV-1a hash of the position buffer, using the values the current code produces (run once, paste them in). This pins Tealight mode for the rest of the work.
- [ ] **Step 2: Run it** with `npx vitest run src/geometry/__tests__/tealightRegression.test.ts` and confirm PASS, then commit.
- [ ] **Step 3: Write failing tests** in `stlParse.test.ts`: parsing `public/box-kit/lamp-post.stl` gives a bbox of about 9.9 × 9.9 × 60 (±0.05); after `moveToOrigin` the min corner is (0,0,0); vertices are deduplicated (index count is 3 × triangle count, positions far fewer than 3 × triangles); a buffer shorter than 84 bytes throws "Not a binary STL".
- [ ] **Step 4: Run to verify failure,** then copy the seven STLs to `public/box-kit/` with the names above and implement `parseBinaryStl`, `moveToOrigin`, and `bundledPartsFor` (pairing from the spec: `cover-2aa` with `2AA`, `cover-2aaa` with `2AAA`).
- [ ] **Step 5: Run the tests,** then commit `git add public/box-kit src` with "feat: bundled kit parts and STL parser" (do not add `research/`).

---

### Task 2: Measure the kit and record it

**Files:**
- Create: `scripts/measure-kit.ts`, `src/geometry/box/kitSpec.ts`, `src/geometry/box/__tests__/kitSpec.test.ts`

**Interfaces:**
- Consumes: `parseBinaryStl` from Task 1.
- Produces: `type WallId = 'w1' | 'w2' | 'w3' | 'w4'` (w1 and w4 are the 120 mm walls, w2 and w3 the 147 mm walls, matching the numbers on the original parts); `export const KIT: KitSpec` with at least: `boxW: 120`, `boxD: 150`, `wallThickness: number`, `walls: Record<WallId, { length: number; maxHeight: number; features: Feature[] }>` where `Feature = { kind: 'tab' | 'boss' | 'hole'; x: number; y: number; w: number; h: number; z0: number; z1: number }` (position and size in the wall's own plate frame: x along the wall's height direction, y along its length, z through the plate), `panelPlaneX: number` (where the panel plane sits in a wall's x), `wallOffset: { short: number; long: number }` (distance of each wall plate from the box axis), `postLength: 60`, `lightHeightRange: [number, number]`, `T: number`.

- [ ] **Step 1: Write the script** `measure-kit.ts` (run with `npx tsx scripts/measure-kit.ts`): for each wall STL in `research/…_stls/` print the plate thickness (the z of the main flat face; measured values so far: 3.0 mm plate, tabs to 4.2, and bosses to 9.7 on `obj_2_3`/`obj_3_2`), and every connected group of faces above the plate as a bounding box. For the tray print the rim notch positions. The scene positions in the files are not an assembly, so also print the data needed to derive `panelPlaneX`, `wallOffset` and `T` (tab positions against the tray rim notches and the 114 × 144 panel inset).
- [ ] **Step 2: Fill in `kitSpec.ts`** from the output. Any value that cannot be established from the files is not guessed: stop and ask the owner (spec rule).
- [ ] **Step 3: Write the tests** in `kitSpec.test.ts` that assert the recorded values against the real STLs (read from `research/` when present, else skipped with a clear skip message): wall lengths 120 and 147 (±0.1), `wallThickness` equals the measured plate thickness, every feature lies inside its wall's bounding box.
- [ ] **Step 4: Run the tests and commit** `scripts` and `src` with "feat: measured kit specification".

---

### Task 3: Shadow model maths

**Files:**
- Create: `src/geometry/box/shadowModel.ts`, `src/geometry/box/__tests__/shadowModel.test.ts`

**Interfaces:**
- Consumes: `KIT` and `WallId` from Task 2.
- Produces: `rimPoint(wall: WallId, s: number): { d: number; angle: number }` (position `s` in mm along that wall from its start to the plan distance and direction from the box axis); `reachForHeight(h: number, d: number, L: number, T: number): number`; `heightForReach(r: number, d: number, L: number, T: number): number`.

- [ ] **Step 1: Write failing tests:** `heightForReach(reachForHeight(h,d,L,T),d,L,T)` returns `h` within 1e-9 for several values; at `h = 0` reach equals `d·(L+T)/L`; `rimPoint` for the midpoint of a wall has `angle` equal to that wall's outward direction (0, π/2, π, 3π/2 in wall order); the last point of one wall and the first point of the next return the same `{d, angle}` (corner continuity).
- [ ] **Step 2: Run to verify failure,** then implement the three functions using the formula in Global Constraints.
- [ ] **Step 3: Run the tests and commit.**

---

### Task 4: Rim profile from the image

**Files:**
- Create: `src/geometry/box/rimProfile.ts`, `src/geometry/box/__tests__/rimProfile.test.ts`

**Interfaces:**
- Consumes: `rimPoint`, `heightForReach`, `KIT`; `GrayImage` from `src/types`, `luminanceAt` and `tableToPixel` from `src/geometry/tealightShade` (import only).
- Produces: `interface BoxParams { shadowSize: number; lightHeight: number; tray: TrayId; threshold: number; invert: boolean; minSpike: number; minGap: number; panelThreshold: number; panelInvert: boolean }`; `DEFAULT_BOX_PARAMS: BoxParams` (shadowSize 450, minSpike 1.2, minGap 0.8, lightHeight from `KIT.lightHeightRange`); `interface RimProfile { heights: Record<WallId, Float32Array>; step: number; warnings: string[]; clamped: boolean }` (top-edge height above the panel plane every `step` mm along each wall); `buildRimProfile(img: GrayImage, p: BoxParams): RimProfile`.

- [ ] **Step 1: Write failing tests:** a solid-dark disc image gives equal heights on opposite walls; an asymmetric image gives heights where the end of each wall equals the start of the next (corner continuity, ≤ 1e-6); a blank white image gives every height at the minimum rim and a warning that the shadow is empty; a requested `shadowSize` the light cannot reach sets `clamped` and a warning; single-pixel noise (a few isolated dark pixels) yields no spike narrower than `minSpike` after processing; heights never exceed each wall's `maxHeight` or `L − 1`.
- [ ] **Step 2: Run to verify failure,** then implement. Approach: sample the reach for each rim point from the image (dark = shadow, `invert` flips it), convert with `heightForReach`, clamp, then widen any run narrower than `minSpike` and drop gaps narrower than `minGap`, adding a warning with the count of changes. Add the warning text "Only shapes with one reach per direction from the light can be reproduced; anything else is simplified." once.
- [ ] **Step 3: Run the tests and commit.**

---

### Task 5: Wall mesh

**Files:**
- Create: `src/geometry/box/wallMesh.ts`, `src/geometry/box/__tests__/wallMesh.test.ts`

**Interfaces:**
- Consumes: `KIT`, `RimProfile`, `checkMesh` from `src/geometry/meshCheck`, `IndexedMesh`.
- Produces: `generateWall(id: WallId, profile: RimProfile): IndexedMesh` (plate in the original orientation: x along height from the attached edge, y along length, z through thickness, min corner at origin, including the tabs, bosses and holes in `KIT.walls[id].features`).

- [ ] **Step 1: Write failing tests:** for each of the four walls, the mesh passes `checkMesh` with `watertight === true`; its bbox length is `KIT.walls[id].length` (±0.05) and thickness is the plate thickness plus the tallest feature; for every recorded feature the generated mesh contains a face at `z1` covering that feature's box (mating-dimension acceptance, tolerance 0.1 mm); a flat profile gives a straight top edge at `KIT.panelPlaneX + h`.
- [ ] **Step 2: Run to verify failure,** then implement by extruding the 2D outline (attached edge, sides, top edge from `profile.heights`) to the plate thickness and adding the features as prisms (a prism for each tab and boss, a through-cut for each hole).
- [ ] **Step 3: Run the tests and commit.**

---

### Task 6: Panel mesh

**Files:**
- Create: `src/geometry/box/panelMesh.ts`, `src/geometry/box/__tests__/panelMesh.test.ts`

**Interfaces:**
- Consumes: `GrayImage`, `BoxParams`, `checkMesh`.
- Produces: `generatePanel(img: GrayImage, p: BoxParams): { mesh: IndexedMesh; triangleCount: number; warnings: string[] }` (114 × 144 mm, base z 0 to 3.0, relief tops at 3.5 and 4.0).

- [ ] **Step 1: Write failing tests:** watertight; bbox 113.9 × 143.9 (±0.1) by 4.0 for a mixed picture; a flat white picture gives only the plate (max z 3.0); a flat black picture gives max z 4.0; dark pixels map to the higher step and `panelInvert` swaps that; a large picture (2000 × 2000) still yields at most 500,000 triangles (downsample or merge coplanar cells).
- [ ] **Step 2: Run to verify failure,** then implement as a column heightfield on a grid chosen from the triangle budget, merging neighbouring cells of equal height.
- [ ] **Step 3: Run the tests and commit.**

---

### Task 7: Zip writer and kit builder

**Files:**
- Create: `src/geometry/box/zip.ts`, `src/geometry/box/kit.ts`, `src/geometry/box/__tests__/zip.test.ts`, `src/geometry/box/__tests__/kit.test.ts`

**Interfaces:**
- Consumes: everything above; `indexedMeshToBinarySTL(positions, indices, header)` from `src/geometry/stl.ts`.
- Produces: `makeZip(entries: { name: string; data: Uint8Array }[]): Uint8Array` (store only, CRC-32); `type PartLoader = (file: string) => Promise<ArrayBuffer>`; `interface KitPart { id: string; label: string; generated: boolean; mesh: IndexedMesh; stl: ArrayBuffer }`; `interface KitResult { parts: KitPart[]; preview: IndexedMesh; warnings: string[]; clamped: boolean; zip: Uint8Array }`; `buildKit(shadow: GrayImage, panel: GrayImage, p: BoxParams, load: PartLoader): Promise<KitResult>`.

- [ ] **Step 1: Write failing tests:** `makeZip` of two entries round-trips (parse the local headers: names, sizes and CRCs match, and the central directory count is 2); `buildKit` with a node `fs` loader returns 4 walls, 1 panel, and the 5 bundled parts for the chosen tray (names such as `wall-1.stl`, `panel.stl`, `tray-2aa.stl`); a bundled part's exported triangle count equals the source file's triangle count (unchanged); changing `tray` swaps the tray and cover only; the zip contains one entry per part; `preview` is non-empty and its bbox is about 120 × 150.
- [ ] **Step 2: Run to verify failure,** then implement `makeZip` (CRC-32 table) and `buildKit` (generate walls and panel, load and move bundled parts to the origin, create the preview by placing parts with the transforms in `KIT`).
- [ ] **Step 3: Run the tests and commit.**

---

### Task 8: Worker pipeline

**Files:**
- Create: `src/workers/boxCompute.ts`, `src/workers/box.worker.ts`, `src/workers/boxRunner.ts`, `src/workers/__tests__/boxCompute.test.ts`

**Interfaces:**
- Consumes: `buildKit`, `PartLoader`.
- Produces: `interface BoxRequest { shadow: GrayImage; panel: GrayImage; params: BoxParams }`; `interface BoxOutput { parts: { id: string; label: string; generated: boolean; stl: ArrayBuffer }[]; preview: { positions: Float32Array; indices: Uint32Array }; zip: ArrayBuffer; warnings: string[]; clamped: boolean; ms: number }`; `runBoxRequest(req: BoxRequest, load: PartLoader): Promise<BoxOutput>`; `runBox(req: BoxRequest): Promise<BoxOutput>` (worker with main-thread fallback, cancelling any earlier run, like `runTealight`).

- [ ] **Step 1: Write a failing test** that `runBoxRequest` with the fs loader returns 9 parts for the default params, a non-empty zip, and `ms >= 0`.
- [ ] **Step 2: Run to verify failure,** then implement by copying the structure of `tealightRunner.ts` and `tealight.worker.ts` (transfer the buffers). In the worker the loader is `fetch(\`${import.meta.env.BASE_URL}box-kit/${file}\`)`.
- [ ] **Step 3: Run the tests and commit.**

---

### Task 9: Hook with generate and stale rules

**Files:**
- Create: `src/hooks/useBoxGenerator.ts`, `src/hooks/__tests__/useBoxGenerator.test.ts` (pure-logic parts only; extract `isStale(currentKey: string, generatedKey: string | null, hasResult: boolean): boolean` and `inputKey(...)` to a small exported helper in the same file)

**Interfaces:**
- Consumes: `runBox`, `DEFAULT_BOX_PARAMS`, `loadImageToGray`.
- Produces: `useBoxGenerator(active: boolean)` returning `{ params, setParams(patch), shadowName, panelName, selectShadow(file), selectPanel(file), result, busy, stale, error, generate, downloadKit, downloadPart(id) }`, with the existing `src/assets/hanuman.png` as the default shadow image and `src/assets/cat.png` as the default panel picture, so the mode shows a model on first load.

- [ ] **Step 1: Write failing tests** for the helper: stale is false with no result; stale is false when the keys match; stale is true after any parameter or image change.
- [ ] **Step 2: Run to verify failure,** then implement the hook following `useTealightGenerator.ts` (generate once when `active` becomes true and both images are loaded, and whenever either image changes; settings changes only mark it stale; the token pattern drops results from cancelled runs). Use `downloadSTL` for single parts and a blob link for the zip.
- [ ] **Step 3: Run the tests and commit.**

---

### Task 10: UI and mode wiring

**Files:**
- Create: `src/components/BoxPanel.tsx`, `src/components/BoxViewport.tsx`
- Modify: `src/App.tsx` (add `'box'` to `AppMode` and `MODES`, render `BoxPanel` and `BoxViewport` for it)

**Interfaces:**
- Consumes: `useBoxGenerator` return type.
- Produces: `BoxPanel({ c })` with two image pickers (shadow, panel), tray choice (2×AA, 2×AAA), light height, shadow size, minimum spike, threshold and invert, a warnings list, and buttons "Generate 3D model", "Download kit (zip)" and per-part STL links; `BoxViewport({ preview, stale, busy, onGenerate, ... })` showing the assembled box on a wall plane with the light and the lit shadow, plus the out-of-date banner using the same wording as tealight.

- [ ] **Step 1: Implement both components** following `TealightPanel.tsx` and `TealightViewport.tsx` styling (copy the small helper components locally; do not edit the tealight files). In `App.tsx` the Tealight branch must render exactly as before; `box` adds a separate branch, and the mode switch shows both modes.
- [ ] **Step 2: Verify nothing changed in tealight:** run `npx tsc --noEmit` and `npx vitest run` (the Task 1 regression pin must pass unchanged); run `git diff --stat main -- src/components/Tealight* src/components/TableInset.tsx src/hooks/useTealightGenerator.ts src/geometry/tealightShade.ts src/workers/tealight*` and confirm it prints nothing.
- [ ] **Step 3: Check in the browser:** start `npm run dev`, switch to Box shadow, confirm a model appears on load, changing a slider shows the banner without regenerating, replacing either image regenerates, the zip downloads with nine STLs, and Tealight shade looks and behaves as before.
- [ ] **Step 4: Update `ARCHITECTURE.md`** with a short Box shadow section (files, the shadow formula, the fixed 120 × 150 size, the bundled parts), then commit "feat: box shadow mode".
