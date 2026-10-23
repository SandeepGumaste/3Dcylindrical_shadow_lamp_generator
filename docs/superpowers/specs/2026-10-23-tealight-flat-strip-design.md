# Tealight flat strip export

Date: 2026-10-23. Status: draft for approval (owner approved the scope in conversation: Tealight mode, 2-layer sheet, ring in the same export, lockable overlap).

## Intent

Today the Tealight shade prints upright as a cone shell. The owner wants to print it FLAT instead: the cone's wall unrolled into one thin sheet that is only two printed layers thick (about 0.4 mm). Only a sheet that thin bends cleanly, so it is rolled back into a cone by hand after printing. A flat print has no overhangs and no supports, and the pattern edges come out crisp.

Reference: a MakerWorld model that is a flat panel with a solid top and bottom rail, vertical bars between them and the silhouette cut into the panel (the owner's turntable picture).

## Goals

- A "Flat strip" STL for Tealight mode that, rolled up, throws the same shadow as the upright shade for the same settings (same image, offsets, scale, light height).
- The strip is exactly the Tealight cone's developed (unrolled) surface. The cone narrows from the foot to the top, so the developed shape is a fan: a ring sector with slightly curved top and bottom edges, not a rectangle. The code must handle the cylinder case (`topDiameter == innerDiameter`, taper 0) as a straight rectangle.
- A base ring in the same export (same STL file, laid out side by side with the strip, both flat on the bed). The ring has a groove that takes the strip's bottom edge and holds it round.
- A lockable overlap at the seam: the strip's two ends overlap and snap together with no glue.
- Everything fits a normal print bed when the shade does (a 44 mm shade unrolls to about 140 mm by 42 mm plus the overlap tab).

## Non-goals

- Not for the other modes (Box, Shadow wall, cylinder lamp, bowl) in this change.
- Not replacing the upright STL: it stays, and the flat strip is an extra download.
- No top ring, no LED socket, no vents, and no floor plate in the flat export (see Calls made).
- Flexible-filament (TPU) tuning is out of scope. The 2-layer sheet is meant for PLA/PETG.

## Anti-goals

- The seam lock or the ring must never cut into the image area. The lock lives only in the solid rim bands (or the foot band), never in the pattern band.
- A strip that cannot print (floating pieces, features under one nozzle width) must not be offered for download without a warning.

## Constraints

- Sheet thickness is `flatLayers * layerHeight`, default 2 layers at 0.2 mm = 0.4 mm. Both are user settings.
- Existing Tealight geometry code (`tealightShade.ts`: field, islands, bridging, `minFeature`) is reused, not copied. Pure functions only (no DOM), so it runs in the existing worker.
- The meshes must pass the existing `checkMesh` watertight check, as the upright model does.
- Ribs: the triangular rib bumps would make the sheet thick and stop it bending. In flat mode the rib STRIPS stay as flat solid bars (they keep islands attached, like the bars in the reference model) but with no bump. Auto-rib choice stays; its "bridge span" reasoning is about printing overhangs and is not needed here, so in flat mode the bar count is the manual `ribs` setting and `suggestRibs` is not called; floating pieces are handled by the existing `autoBridge`.

## What was decided (owner)

1. Source mode: Tealight shade (the cone).
2. Sheet is 2 layers thick so it bends.
3. The ring is part of the same export.
4. The seam is a lockable overlap (tongue-and-slot was proposed and accepted).

## How it works

### Developed cone

For the inner cone `R(z) = Rb + k z` with `k = (Rt - Rb) / H`, the developed surface has apex distance `ρ(z) = R(z) / sin(β)` with `sin β = |k| / sqrt(1 + k²)`, and a node `(θ, z)` lands at polar angle `ψ = θ sin β` about the unrolled apex. Convert to x/y. The cylinder (`|k| < 1e-6`) uses x = R θ, y = z. The pattern field (`buildTealightField`) is computed once on the same (theta, z) grid, so the shadow is the same as upright. The flat path calls `deriveGeometry` with `wallThickness` set to the sheet thickness, so the ray taper between inner and outer surface is about zero (0.4 mm) and the strip is the inner surface extruded straight. Foot band minimum stays 3 mm.

The sheet is cut at one seam (angle 0). Unlike the upright shell, the grid does not wrap: the left and right edges are real borders with end walls.

### Ring

An annulus about 4 mm tall, printed with its axis vertical (like a washer, flat face on the bed), so the groove opens upward. It sits next to the strip on the bed. Inner radius leaves the tealight clear (about the shade's own inner radius, tealight stays inside). A groove in its top face is `sheet thickness + 0.3 mm` wide and about 3 mm deep, centred on the shade's foot radius (cone radius at z = 0 plus half the sheet thickness), so the strip's foot (solid foot band, at least 3 mm) seats in it. The ring is 1 mm thicker than the groove is deep, so the strip's z = 0 sits 1 mm above the table.

To keep the shadow the same as the upright shade, the flat path treats the ground as 1 mm below the strip's z = 0 and lowers the light height by the same 1 mm (`hf - 1`), using the same ground-offset form the Shadow wall base already uses (`q * (hf + G) / (hf - z)`). `compareShadow` against the upright result is the test. The ring is a rigid part, so it also keeps the base circle exact.

### Seam lock

The seam is a butt joint through the pattern band and an overlap only in the rim bands, so no pattern is ever covered by a second layer. The seam sits in the middle of a solid bar (pick the bar nearest angle 0; with no bars, the column with the most solid material), so the cut costs no image. Each end carries an overlap tab, about 8 mm wide, in the top rim band only. The tab lies on the inside of the other end when rolled. Two arrow-shaped tongues (barbed lugs, flexing in the sheet plane) on the tab pass through matching slits in the far end and snap behind them. Slits are `tongue width + 0.4 mm` wide. The lock should open and close a few times without breaking.

At the foot there is no tab (the groove would have to hold two sheets). The ring has a short widened pocket in its groove at the seam angle, where the two ends meet, and the ring has a small notch mark on its top face so you can line the seam up with it.

### UI and outputs

- Tealight panel gets a "Flat strip (2 layers)" download next to the STL button, plus two inputs: Layer height (mm) and Layers (default 2).
- One STL with the strip and the ring placed side by side on the bed, both on z = 0.
- The existing viewport preview keeps showing the upright shade (no new 3D preview required); a small flat preview of the strip + ring layout is nice to have.
- A warning if the strip is wider than 250 mm or taller than 250 mm (does not fit common beds).
- The strip is computed only when the Flat strip button is pressed (a separate worker request), not on every setting change. Warnings (floating pieces, features dropped, bed size) are shown; only a non-watertight mesh blocks the download, same rule as the upright STL.

## Left to the builder

- Exact tongue and slit shapes and sizes, as long as they meet the rules above.
- Whether the flat meshing reuses `buildShell` (extended to a non-wrapping grid) or a small dedicated mesher.
- The ring's exact height and groove size and the gap between strip and ring on the bed.
- Wording and layout of the new UI controls, matching the existing Tealight panel.

## Calls made (not from the owner)

- No top ring: the sheet is held round at the top by its own cone shape, the rim bands and the lock. A top ring can come later.
- No floor plate and no LED socket in the flat export: the tealight stands on the table inside the ring.
- Rib bumps dropped, rib strips kept as flat bars.
- Defaults: 0.2 mm layers x 2, overlap tab 8 mm, two tongues.
- Lock tab in the top rim band only; the foot has no tab, the ring has a widened pocket at the seam.
- Seam inside a solid bar, not at angle 0 when that would split a bar badly.
- Ring 1 mm thicker than groove depth, compensated in the shadow math.
- Manual rib count in flat mode, no `suggestRibs`.
