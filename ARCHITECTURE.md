# Odd Shadows (3D shadow lamp generator)

## What this is

A browser-based design tool (React + Three.js + TypeScript, built with Vite) that turns a 2D image into a 3D-printable cylindrical lampshade. When lit from inside by an LED and photographed from above or from the side, the shade's pattern of holes casts a shadow of the *original image* onto a tabletop (360° radial projection) or a vertical wall/screen.

It is not a generic 3D modeling app — it solves one specific inverse problem: *given a target shadow image and a light position, what pattern of solid/open cells on a cylinder surface would produce that shadow?* It then turns that solution into a validated, watertight mesh ready for slicing (STL) or into flat SVG templates for laser-cutting/manual crafting.

## Core concept: inverse shadow projection

Ordinary forward rendering casts light from a source, through geometry, onto a surface. This app runs that backwards:

1. Start with the desired shadow (the user's uploaded/selected image, projected onto a tabletop disc or a flat wall screen).
2. For every point on that target surface, cast a ray back from the light position, through the lamp's cylindrical wall, and record which cylinder cell (a `segmentsAround × segmentsVertical` grid, "unwrapped" via `θ → u` in [src/geometry/cylinder.ts](src/geometry/cylinder.ts)) it passes through.
3. Accumulate the target image's brightness into each cylinder cell it maps to, producing an intensity grid over the cylinder surface.

This is implemented in [`solveInverseShadow`](src/shadow/solver.ts) (tabletop and vertical-wall modes) and the supporting ray/plane math in [src/shadow/projection.ts](src/shadow/projection.ts) and [src/geometry/cylinder.ts](src/geometry/cylinder.ts).

The resulting intensity grid is then converted into an actual hole/solid pattern by [`generateCylindricalMask`](src/shadow/halftone.ts) — either a Bayer-dithered halftone or a binary threshold — with an option to preserve thin "bridges" between regions so the shape stays 3D-printable (islands of material can't float in mid-air), and optional structural radial struts (ribs) for both print strength and a stylized shadow effect.

## End-to-end pipeline

```
Image (upload or built-in sample)
  → grayscale + adjustments (brightness/contrast/gamma/threshold/rotate/flip/invert)
        [src/image/loadImage.ts, src/image/grayscale.ts]
  → inverse shadow solve → per-cell intensity grid
        [src/shadow/solver.ts, src/shadow/projection.ts]
  → halftone/binary mask over the cylinder grid
        [src/shadow/halftone.ts]
  → 3D triangle mesh (walls, rim, base, LED cavity, wire slot) + validation
        [src/geometry/mesh.ts]
  → render in Three.js viewport  /  export
        [src/components/ThreeViewport.tsx]
        [src/geometry/stl.ts → .stl]
        [src/geometry/svg.ts → circular map / unwrapped map .svg]
```

Generation (solve → mask → mesh → validate) runs inside a Web Worker ([src/workers/generateLamp.worker.ts](src/workers/generateLamp.worker.ts), orchestrated by [`runGeneration`](src/workers/lampRunner.ts)) so the UI thread stays responsive and can report progress while a full-resolution lamp is computed.

## Key domain types (`src/types/index.ts`)

- **`LampConfig`** — physical shade parameters: diameter, height, wall thickness, minimum feature size, hole size, grid resolution (`segmentsAround` × `segmentsVertical`), rim heights, and printer-friendly extras (base with cavity for a tea light/LED, wire slot).
- **`LightConfig`** — virtual light source: position relative to the lamp, projection target (`'tabletop'` or `'vertical_wall'`), table radius / projection screen size, and radial strut settings (spoke count, configurable strut width in columns / physical mm, and customizable strut length extending towards center).
- **`ImageAdjustments`** — standard image prep controls plus `mode: 'halftone' | 'binary'`.
- **`HalftoneOptions`** — dithering mode/threshold, Bayer matrix size, bridge preservation, strut count/width/length.
- **`MeshData` / `TriangleMesh`** — positions/normals/indices plus `isWatertight` and `validationErrors`, so a broken (non-printable) mesh is surfaced before export.
- **`Preset`** — named bundles of lamp/light/resolution settings (see `PRESETS` in [ControlsPanel.tsx](src/components/ControlsPanel.tsx)) for quick starts.

## UI structure (`src/App.tsx` + `src/components/`)

- **`App.tsx`** — owns all state (`lamp`, `light`, `adjustments`, active image source, generated mesh, generation progress) and wires the pipeline together: image handlers, `runGeneration`, and the three export handlers (STL, circular SVG, unwrapped SVG).
- **`ControlsPanel.tsx`** — the left-hand control surface: image upload/drag-drop, six built-in synthetic sample images (dragon, wolf, celestial, circle, mandala, stripes — see [`createSyntheticTestImage`](src/image/loadImage.ts)), presets, all lamp/light/adjustment sliders, generate/export buttons, and live progress/triangle-count display.
- **`ThreeViewport.tsx`** — live Three.js preview of the generated mesh, with camera presets (front/top/side/perspective), reset, and animation loop.
- **`ShadowPreview.tsx`** — a 2D preview of the simulated shadow the current design would cast, for feedback before committing to a full 3D generation.

## Export formats

- **STL** ([src/geometry/stl.ts](src/geometry/stl.ts)) — binary STL of the validated watertight mesh, for slicing and 3D printing.
- **Circular map SVG** ([`generateCircularMapSvg`](src/geometry/svg.ts)) — the hole pattern laid out as a circular/annular map.
- **Unwrapped map SVG** ([`generateUnwrappedMapSvg`](src/geometry/svg.ts)) — the cylinder surface unrolled flat (θ × height), useful for laser-cutting a flat sheet that's then rolled into a cylinder, or as a manual template.

## Tech stack

React 19, Three.js, Vite 8, TypeScript, Tailwind CSS 4, Vitest (unit tests live under `__tests__/` in `src/geometry`, `src/image`, and `src/shadow`).

## Directory map

```
src/
  types/       shared domain types (LampConfig, LightConfig, MeshData, Preset, ...)
  image/       load/decode image, grayscale conversion, bilinear sampling, synthetic samples
  shadow/      inverse projection math, solver, halftone/mask generation
  geometry/    vector math, cylinder ray intersection, mesh building + validation, STL/SVG export
  workers/     web worker entry point + runGeneration orchestration
  components/  ControlsPanel, ThreeViewport, ShadowPreview
  App.tsx      top-level state + pipeline wiring
```

## Table modes: tealight shade and shadow-art bowl

The app has three modes: **Cylinder lamp (wall)** (everything above, unchanged), **Tealight shade (table)** and **Shadow-art bowl**. Tealight shade is the default; the cylinder and bowl modes are hidden in the UI for now but their code is kept. The table modes are self-contained and use a z-up, table-at-z=0 convention (the cylinder mode is y-up).

```
src/geometry/tealightShade.ts   params, r(z)/z_max formulas, inverse sampling, ribs/vents/island bridging, rib optimizer (suggestRibs), closed floor, LED socket, forward projection (compareShadow)
src/geometry/shellMesh.ts       generic marching-squares shell mesher on a (theta, z) field; shared vertices, seam wrap, watertight by construction
src/geometry/shadowBowl.ts      silhouette radii -> h(theta) = hLED (1 - R / rs), smoothing, revolved profile mesh
src/geometry/meshCheck.ts       index-based manifold / orientation / degenerate / signed-volume checks
src/image/tealightSamples.ts    procedural sample patterns (mandala, crest, cat head) + asymmetric test image
src/assets/                     bundled default images (Hanuman, Cat), each with its own default image size
src/workers/tealight*.ts        shared compute, worker and runner (main-thread fallback)
src/hooks/useTealightGenerator.ts  state, bundled images, validation, manual generate + stale tracking, STL/map download
src/components/Brand.tsx          Odd Shadows header (logo mark + wordmark); favicon is public/favicon.svg
src/components/Tealight*.tsx, TableInset.tsx   panel, lit three.js preview, collapsible forward-projection inset
```

Notes: outer-surface vertices sit where the ray from the light through the inner vertex meets the outer cone (a constant scale about the light), blended to zero at the bottom and top rims so both rims stay planar. Wall rows are spaced geometrically in table radius, so cells are roughly square on the table rather than on the wall. The bowl uses the outer top edge of the rim (R + wall) as the grazing edge.

### Tealight shade details

- **Image placement:** the image is sampled as the shadow on the table, scaled by `imageScale` (% of the shadow disc) and shifted by `imageOffsetX/Y`, which moves the light relative to the image.
- **Open bands:** `patternGapBottom` and `patternGapTop` (mm, default 0) cut a full-width ring opening just below and just above the pattern (the foot and a rim of at least 2 mm stay solid). `deriveGeometry` raises `baseBand` by the bottom gap and adds node rows above `zmax` for the top gap; `openLo`/`openHi` are the rows spanning pattern plus openings. The ribs are forced solid through all of those rows so the foot, pattern and rim stay one piece, and `suggestRibs` counts the openings (a flat-roofed ring needs a rib every `maxBridge` mm). Manual rib counts below 3 are rejected while a gap is set.
- **Ribs:** each rib is a solid vertical strip across the pattern band with a triangular bump on the inner wall that points toward the axis. Ribs are placed from `ribAngleList(p)`: explicit `ribAngles` if set, otherwise `ribs` evenly spaced from angle 0. The inner bump (`ribBump`) fades out above the pattern band so the top rim stays clean.
- **Rib optimizer** (`suggestRibs`, on by default via `autoRibs`): builds the wall field with no ribs (after small-feature cleanup and island bridging), then looks for printing overhangs. A hole needs support when its cross-section is wider than `maxBridge` (default 8 mm) and its roof is shallower than about 45 degrees. It tries 2, 4, 6 ... up to 48 evenly spaced ribs, each at a few rotations, and keeps the first that leaves no such hole, so the ribs always look uniform. The count depends on the image and can be 0 if nothing needs support. Editing Support Ribs by hand sets `autoRibs` to false. The suggestion is computed in `runTealightRequest` (`src/workers/tealightCompute.ts`) and returned as `ribSuggestion`, which the panel uses to show the count and a hint.
- **Floor and vents:** `closeBottom` adds a solid floor plate under the shade (with vents off); otherwise base vents are arches cut up from the bottom edge, centred between ribs.
- **Printability checks:** minimum feature size drops tiny holes and specks, auto-bridge attaches floating islands with thin strips, and `meshCheck` verifies the mesh is watertight.
- **Layout:** on desktop the preview fills the right column and the "Table shadow check" inset (`TableInset.tsx`) is a collapsible bar underneath, collapsed by default. On mobile the preview is sticky at the top with the controls scrolling under it and the action bar pinned.
- **Manual generation:** the model is built when an image is first loaded (the default Hanuman on start-up), when another bundled image is picked, and when an image is uploaded. Changing any setting does not regenerate: the hook keeps a snapshot of the inputs (mode, parameters, image) used for the last result, and when the current inputs differ `stale` is true. The viewer then shows a floating "model needs to be generated again" banner with a Generate button, the panel button reads "Regenerate 3D Model", and STL/SVG export is disabled until it is regenerated.

## Box shadow mode

A wall-hung shadow box kit, fixed at 120 × 150 mm: a silhouette image becomes the top edges of four wall plates, so the box throws that silhouette on the wall behind it while a separate picture glows on the panel. It is a mode next to Tealight shade and shares none of its code.

```
src/geometry/box/kitSpec.ts      measured constants of the owner's kit (dimensions, tabs, light axis, T) from scripts/measure-kit.ts
src/geometry/box/kitParts.ts     which bundled STLs go with which tray (2xAA / 2xAAA)
src/geometry/box/shadowModel.ts  r = d (L + T) / (L - h) and its inverse; rim positions relative to the light axis
src/geometry/box/rimProfile.ts   silhouette image -> top-edge height around the four walls, thin-spike widening, notch filling, warnings
src/geometry/box/wallMesh.ts     one wall plate with its tabs (closed mesh), solid outline
src/geometry/box/plateField.ts   per-wall solid/open cell mask for inner details: openings, thin-stroke thickening, narrow-gap filling, island bridging
src/geometry/box/perforatedWall.ts  wall plate with openings: smooth loops (contours.ts) + cdt2d, side faces from the boundary edges
src/geometry/box/panelMesh.ts    picture panel: 3 mm plate, picture raised to 3.5 / 4.0 mm, checkerboard-safe
src/geometry/box/kit.ts          builds all ten parts, the assembled preview and the zip
src/geometry/box/zip.ts          store-only zip writer
src/workers/box*.ts              compute, worker and runner (same pattern as tealight)
src/hooks/useBoxGenerator.ts     two images, settings, generate on image change, out-of-date rule
src/components/Box*.tsx           panel and the lit wall preview
public/box-kit/                  the owner's fixed parts (trays, lamp post, cap, hook, battery covers), exported unchanged
```

- **Geometry:** the light sits on the lamp post at height `L` above the panel; the panel plane is `T` = 21.5 mm in front of the mounting wall. A wall top at height `h` above the panel plane and distance `d` from the light axis grazes the ray that lands at `r = d (L + T) / (L - h)`, so the silhouette's reach in each direction sets the wall height there. The light axis is the 10 mm post bore at the box centre (60, 75 mm in the tray frame). The walls stand in the 3 mm channel outside the tray's inner wall, seated on the tray skirt 7.46 mm above the mounting wall, so a wall's plate height is `h + 14.04` mm.
- **Limits:** only shapes with one reach per direction from the light can be reproduced. The shadow image is blurred before the threshold by the edge rounding setting (0 to 40, radius = value / 10 image pixels, default 10, as in Tealight), which smooths jagged edges. The image is read between pixels (bilinear, with the edge found by interpolation), and with Inner details the wall outline's top vertices are snapped onto the exact rim profile, because the 0.4 mm cell grid would otherwise turn into centimetre steps on the wall at far radii. Dark blobs under 25 mm² on the wall are ignored as stray pixels, spikes narrower than the minimum spike width are widened and narrower notches filled, and the user is told. Walls never drop below 15 mm from their seat (they carry their tabs) or exceed `L - 1` above the panel plane. The box has a smallest possible shadow (about 90 to 145 mm from the light for the default light height); smaller shapes are drawn larger and the user is warned. The shadow size (150 to 3000 mm) and the image size in shadow (20 to 300 %, as in Tealight) multiply to the width of the image on the wall. The light height is limited to 20 to 52 mm (the 60 mm post plus the 11.9 mm cap).
- **Inner details (option, on by default):** with only a top edge, lit areas inside a dark shape are filled in. With the option on, a wall point at position `s` and height `h` lets light through exactly when the shadow pixel it maps to (`r = d (L + T) / (L - h)`, same direction) is light, so those areas become openings in the walls. The foot (15 mm from the seat) stays solid and the rim profile is a ceiling (cleanup never lifts the top edge, so walls still meet at the corners); strokes thinner than the minimum spike width are thickened, openings narrower than the minimum notch width are filled, and floating pieces (an eye inside a lit face) are bridged to the wall (a long piece gets a bridge about every 24 mm) or dropped, all reported as warnings. Perspective squeezes far radii, so a shape only shows on a wall for radii from about 90 to 145 mm (the box's own shadow) outwards; small shapes need a larger image size. Off keeps solid-outline walls.
- **Kit:** four generated walls, the generated panel (with a 10.4 mm hole at the centre for the post) and five bundled parts (tray, battery cover, post, cap, hook) as individual STLs or one zip. The walls keep the tab strips of the originals (rectangular approximations) and are placed so the tabs land on the tray's rim notches: wall 4 along the bottom, 1 along the top (running the opposite way), 3 on the left and 2 on the right (running the opposite way). `KIT` is checked against the original STLs in `kitSpec.test.ts`.
- **Same interaction rules as tealight:** generate on first load and when an image changes (not when the mode is shown again); settings changes only show the out-of-date banner.
