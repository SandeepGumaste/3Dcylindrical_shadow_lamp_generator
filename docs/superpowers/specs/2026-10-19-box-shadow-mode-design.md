# Box shadow mode: design

Date: 2026-10-19. Status: draft for approval.

## Intent and why

Odd Shadows turns an image into a 3D-printable shadow lamp. It has a Tealight shade mode (a perforated cone that projects an image onto a table). The owner also has a second product: a small wall-hung **shadow box**, printed as a kit, that casts a large dark silhouette (a character such as Zoro or Goku) onto the wall around it while a small picture in the middle of the box glows. Today that kit's parts were designed by hand in CAD. This mode lets a user pick any silhouette image and any panel picture and get a complete, printable kit with no CAD work.

The owner's own STL files for the battery-box version of the kit are in `research/索隆投影灯（电池盒版）墙面拆分版++_stls/`. The photos and the two assembly PDFs (battery-box version and rechargeable version, in Chinese) are in `research/`. They are the reference for what a correct kit looks like.

## How the product works (physical model)

- The box hangs on a wall (a keyhole on the back plate and a wall hook part).
- Inside, from the wall outward: back plate, electronics tray (battery holder, switch), the **picture panel** that covers the tray. A **lamp post** passes through the panel and carries an LED at its tip, above the panel, topped by a lamp cap. The LED height is adjustable by sliding the post.
- **Four numbered walls** stand up around the panel and screw together (M3×7 or glue). Their top edges are cut to a profile. Light that clears a wall's top edge continues past the box and lands on the mounting wall; light that hits the wall is blocked. So the height of each wall's top edge at each point sets how far the shadow reaches in that direction. The dark region on the wall is the silhouette.
- The picture panel is lit from the front by the LED and glows. It is a 3 mm plate with the picture raised on top in steps of 0.5 mm and 1.0 mm (three heights in total), which prints as black on white with a filament colour change.

The shadow maths is the same family as the existing, currently hidden, bowl mode (`src/geometry/shadowBowl.ts`): for a rim point at horizontal distance `d` from the light axis and height `h` below a light at height `L`, with the mounting wall a distance `T` behind the panel plane, the shadow edge lands at distance `r = d · (L + T) / (L − h)` from the axis. Solving for `h` gives the wall height needed to place the shadow edge at a chosen `r`. The box differs from the bowl in that the rim is a rectangle, so `d` depends on position along the perimeter and on direction.

## Goals

1. A new **Box shadow** mode next to Tealight shade, using the same interaction rules: the model is generated on first load and when an image changes, and not when other settings change (the existing out-of-date banner applies).
2. Inputs:
   - the **shadow image**: a silhouette, dark = shadow;
   - the **panel picture**, chosen separately by the user;
   - the **electronics tray**: 2×AA or 2×AAA (two bundled tray files);
   - **light height** (adjustable on the real kit via the post, so this is an assumption the user can change);
   - **shadow size** on the wall.
3. A 3D preview of the box on a wall with the lit shadow, in the style of the existing tealight viewer.
4. **Generated parts**: the four walls and the picture panel.
5. **Bundled parts**, exported exactly as in the owner's files and never modified: the chosen tray, lamp post, lamp cap, wall hook and the matching battery cover. One action downloads the whole kit; individual parts can also be downloaded.
6. Printability: walls keep the owner's joinery (tabs, slots, screw holes) so the kit assembles as before, and the app warns about, or repairs, silhouette features too thin to print.

## Non-goals (this version)

- Box sizes other than **120 × 150 mm**. The size is fixed because the bundled parts only fit that footprint. User-chosen sizes are planned as a later version.
- The rechargeable (Type-C) electronics version. Only the battery-box files exist today.
- Any change to the bundled parts' geometry.
- Designing electronics, wiring, or firmware.
- The Cylinder and Bowl modes (they stay hidden; no change).
- UI redesign. That is a separate piece of work, to be done later.

## Anti-goals (a failure even if it technically works)

- Parts that do not assemble: walls that no longer fit the tray, panel or each other.
- A silhouette that prints as fragile spikes that snap off, as in the owner's photos of the existing kit. A printable result is the whole point.
- Silently dropping parts of the silhouette without telling the user.
- A shadow that looks right in the preview but is scaled or positioned wrongly on a real wall.

## Constraints

- Pure-function geometry in `src/geometry/`, runnable in the web worker, like the tealight code. No DOM or three.js in the geometry code.
- Output is binary STL, and meshes must be watertight (the existing mesh checks apply).
- Fixed parts are shipped as static assets in the repo. Loading them in the browser must not slow the first paint. Repo size matters (see the part list).
- Runs fully in the browser, as the rest of the app does.
- The owner owns the designs and agrees they can be bundled in this repo.
- Shadows are limited to **star-shaped** silhouettes: one reach per direction from the light axis. Concave details that wrap back on themselves cannot be produced. Thin slits are possible only as tall thin spikes. The app should say so in the same way the bowl mode does.

## Part inventory (measured from the owner's STLs, in mm)

| File | Size (x, y, z) | Role |
|---|---|---|
| `obj_1_组合体` | 113.9 × 143.9 × 4.0, 506k triangles, 25 MB | Picture panel. Plate at z = 0 to 3.0 with the picture raised to 3.5 and 4.0 (three distinct top heights). Generated. |
| `obj_2_3`, `obj_3_2` | 65.4 × 147.0 × 9.6 | Walls 3 and 2, the two long sides. Generated. |
| `obj_4_4`, `obj_5_1` | 61.9 × 120.0 × 4.2 | Walls 4 and 1, the two short sides. Generated. |
| `obj_12_2AA` | 120 × 150 × 20 | Tray for 2×AA. Bundled. |
| `obj_11_2AAA` | 120 × 150 × 20 | Tray for 2×AAA. Bundled. |
| `obj_10_灯柱9.9` | Ø9.9 × 60 | Lamp post. Bundled. |
| `obj_6_灯帽` | Ø15 × 11.9 | Lamp cap. Bundled. |
| `obj_7_墙上挂钩` | 30 × 30 × 16.8 | Wall hook. Bundled. |
| `obj_8_电池盖` | 25.9 × 60 × 3 | Battery cover (goes with one tray). Bundled. |
| `obj_9_2AA电池盖子` | 33.9 × 55 × 2 | Battery cover (goes with the other tray). Bundled. |

The files are exported from one scene, so parts sit at different positions in space; each must be re-centred and laid flat before export. Which cover goes with which tray is not stated and must be checked against the files and the PDFs. Wall 3 has about 60 distinct thickness levels and wall 4 about 150, so the wall tops have bevels or other detail beyond a flat profile.

## What the owner decided

- Scope is the **whole printable kit**, not only the walls.
- The owner has the STLs, they are the owner's own designs, and the fixed parts are bundled unchanged.
- The panel shows **a separate picture chosen by the user**, not the shadow image.
- The size is **120 × 150 mm** for now. User-chosen sizes come in a later version.
- The UI redesign is out of scope here.

## My calls (the owner can overturn these)

Settled after a fresh reader went through this document. Each is marked as my call, not something the owner agreed.

- **Walls are generated parametrically, not by cutting the original STLs.** The builder measures the mating features (tabs, slots, screw holes, and the inner edge that seats on the tray and panel) from the originals and generates new walls to those dimensions. No mesh boolean operations. Acceptance: a fixed list of mating dimensions, taken from the originals, is checked by a test on every generated wall. If a feature cannot be measured reliably, the builder stops and asks, rather than guessing.
- **Mapping the image to wall height.** The light axis is the box centre. For every point along the rectangular rim, take the direction from the axis to that point, read the silhouette's reach in that direction from the image, and set the wall's top-edge height there with the formula above (`d` is that point's distance from the axis). The height is a continuous function of position around the perimeter, so adjacent walls get the same height at a shared corner automatically. Anything the image asks for beyond what one reach per direction can give is reduced to that and reported to the user. The result is approximate to the image resolution, not exact.
- **Shadow size** means the width of the square image frame as it lands on the wall, in mm, centred on the box axis. A shadow offset setting is optional and not required in this version. If the requested size cannot be reached with the available light height, clamp the size and show a warning, in the same way the tealight mode warns when the pattern is cropped.
- **Light height and distance to the wall.** `L` (LED height above the panel) and `T` (panel to mounting wall) come from the assembled geometry, measured by the builder. `L` is a user setting limited to what the 60 mm post allows. Defaults: `L` near the top of that range, shadow size about three times the box size.
- **Panel tones.** The base plate is the white layer and the raised steps are the black layers. Dark tones in the picture map to the highest step and light tones to the plate, as in the owner's photos of black ink on a white panel. The three heights are 3.0, 3.5 and 4.0 mm, and the filament colour change is at the top of the plate. The builder confirms this against the photos. The triangle count should stay about the same as the original (around 500k) so the worker and the export stay responsive.
- **Battery covers.** `obj_9_2AA电池盖子` is the cover for the 2×AA tray (its filename says so) and `obj_8_电池盖` goes with the 2×AAA tray. The builder confirms by fitting each cover to its tray's opening.
- **Bundled STLs.** The bundled parts total about 6 MB (the two trays, post, cap, hook and two covers) and are committed to the repo as static assets. The panel (25 MB) is generated, so it is not bundled; it stays in `research/` as a reference only and is not committed. Moving each bundled part to a common origin and laying it flat is a rigid transform and is allowed; the shape itself is never changed. Compressing the files in the repo is allowed as long as the exported STL describes the same geometry.
- **Thin features.** Minimum feature width is a user setting. The default is 1.2 mm (three nozzle widths on a 0.4 mm nozzle), because spikes on a wall top need to be stronger than a hole in the tealight shade. The default for a hole or slit is 0.8 mm, as in the tealight mode.
- The mode is added to the existing mode list; no separate page.

## Left to the builder

- Working out the assembled geometry from the STLs: the height of each wall's top edge above the panel plane, the distance `T` from the panel to the mounting wall, the tab and slot positions, and the screw hole positions. Verify by assembling the files in a 3D view before generating anything.
- The exact wall outline, joinery, and any bevels, matching the originals.
- How to turn the shadow image into a wall height at each position along the rim, including where the shadow centre sits relative to the box centre (the original has the silhouette roughly centred on the box).
- How to handle spikes and thin features (widen, drop, or warn), within the anti-goals above.
- How the panel picture becomes the three-height relief (thresholding, dithering, which tones map to which height).
- How to load and cache the bundled STLs, how to centre and orient them for export, and how to produce the single kit download (for example a zip).
- Where parts sit in the preview and how the shadow is drawn on the wall.
- Naming and ordering of exported files, and the user-facing copy.
- Tests: the existing approach (unit tests on the geometry, watertight checks) extended to the new parts, plus a check that the generated walls assemble with the bundled parts (matching mating dimensions).

## Open facts to verify (not guesses to build on)

- Whether the post length allows the full shadow-size range at the chosen box depth. If not, the size clamp above handles it.
- Whether the walls in the original are the same height on all four sides at the corners (they must meet).
- Whether the two trays are fully compatible with one set of walls (same footprint is measured; the inner features are not).
