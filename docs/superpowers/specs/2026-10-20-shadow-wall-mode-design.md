# Shadow wall mode (rectangle and ellipse)

Date: 2026-10-20. Status: approved scope (owner: "yes" to rectangle and ellipse, standing wall only, no base or splitting, new tab on dev).

## Goal

A third mode next to Tealight shade and Box shadow. A standing thin wall around a point light, whose footprint is a (rounded) rectangle or an ellipse instead of Tealight's round cone. Where a ray from the light toward a dark part of the shadow image meets the wall, the wall is solid; everywhere else it is open. The printed wall throws the image's silhouette on the table. The idea comes from the MakerWorld "Light Shadow Art Generator V4.0" (an OpenSCAD model with no licence notice): the geometry is re-derived here from the idea (rays through a footprint); no code is copied.

## Scope

In: rectangle (corner radius) and ellipse footprints; vertical walls; the shadow image placed on the table around the axis; dark = shadow = solid (the Box shadow convention, not Tealight's); a solid foot and a solid top rim; printability cleanup (small features, floating pieces); lit preview, STL download.
Out for now (parked): custom SVG footprint, splitting the wall into flat plates (lying / overhang layouts), base plate with magnet holes, inner pattern layer, ribs, LED socket, vents, SVG export.

## Geometry

- The light is on the vertical axis through the footprint centre at height `lightHeight` (hf). The footprint is the OUTER outline; the inner outline is the outer offset inward by `wallThickness` t along the outline normals.
- Perimeter parameter: u in [0, 1) by arc length, `cols` samples (cell about 0.4 mm along the outline, 60 to 2400). Per sample: outer point p, outward normal n, inner point q = p - t n, distances dIn = |q|, dOut = |p|.
- Wall point (u, z) on the inner surface lands on the table at q(u) * hf / (hf - z) (the ray from the light through it). The shadow image is a square canvas (512 px, whole image fitted) centred on the axis, `shadowSize` mm wide at 100 % `imageScale`, rotated by `rotation`, shifted by `offsetX/offsetY`. Outside the canvas counts as light (open).
- Field value per node (u, z) = (threshold - blurredLuminance * 255) in the Box convention: > 0 solid where the pixel is dark. Blur radius = `edgeRounding` / 10 pixels of the node grid (as Tealight). Foot (z < FOOT = 3 mm) and top rim (z > height - RIM, RIM = 2 mm) are forced solid.
- Outer surface keeps each hole straight along its ray: per column, sRay is the scale at which the ray from the axis through the inner point q(u) meets the outer outline (exact segment-ray intersection on the outline samples). Across the pattern band the outer point of (u, z) is s * q(u) at height zo = hf - (hf - z) * s with s = sRay, i.e. exactly on the straight line from the light through the inner point and on the outer outline. At the foot and rim it blends (weight w: z / foot top below, 1 across the band, (height - z) / (height - band top) above) to the outer outline point p(u) at height z, so s' = 1 + w (sRay - 1) for the height and the xy is p + w (s q - p). The shell is built with the existing marching-squares `buildShell` (periodic in u), so it is closed by construction.
- Rows (z nodes): uniform in the foot, then adaptive in the band: dz = cell * (hf - z)^2 / (dMax * hf) so that the table position moves at most one cell per row in every direction (capped at 1500 rows), then uniform in the rim.
- The solid foot is max(FOOT, 1.25 * (sMax - 1) * hf) tall (sMax = largest sRay over the columns, as Tealight's foot band) so the taper cannot fold the outer surface; validation rejects only when foot + rim + 5 mm exceeds the height.
- Validation: width and length above 2 * (t + 5) mm, corner radius between 2 t and min(width, length) / 2, ellipse needs both axes; height between 20 and hf - 1; `lightHeight` above the height; foot + rim + 5 mm below the height; outer height map strictly increasing (the same fold check as Tealight, per column).

## Cleanup (v1)

1. Specks: holes and solid pieces smaller than a `minFeature` disc (default 0.8 mm) are flipped (the Tealight rule, periodic in u).
2. Floating solid pieces (not connected, 4-neighbour with wrap in u, to the foot or the rim) are removed and counted in a warning; bridging them is parked.

## UI

A tab "Shadow wall (table)". A new hook `useShadowWallGenerator` (image presets and upload shared with Tealight's image list, but with its own `invert` default off), a panel (image, footprint, size, wall, light, shadow, printability), the existing `TealightViewport` for the lit preview (ground radius = half the shadow size), STL download. Same interaction rules as Tealight: generate on first load and image change, settings changes only show the out-of-date banner.

## Rulings made while designing

- Dark = solid (Box convention). Tealight's "black = hole" would give a lit silhouette; the source model casts a dark one. The image presets work in both because the silhouettes are black on white.
- No base plate: the wall stands on the table; the solid foot ring is the base.
- Floating pieces are dropped, not bridged, in v1 (the shapes are centred on the axis, so most connect to the foot through the rays near it).
