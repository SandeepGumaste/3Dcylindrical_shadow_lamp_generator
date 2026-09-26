# 3D Cylindrical Shadow Lamp Generator

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
