# Box shadow mode: inner details (design addendum)

Date: 2026-10-19. Extends `2026-10-19-box-shadow-mode-design.md`. Approved in conversation: "build it, with inner details as an on/off option".

## Why
With only a top edge per wall, every direction from the light is dark out to the farthest dark pixel, so lit areas inside a dark shape (a face inside an outline) are filled in. The owner uploaded a silhouette with a lit face and got a solid black shadow.

## What
An **Inner details** option (on by default) that cuts openings in the walls. A point of a wall at position `s` along it and height `h` above the panel plane lets light through exactly when the shadow pixel it maps to is light: that pixel is at distance `r = d (L + T) / (L - h)` from the light axis, in direction `angle` (the same maths as the top edge). So a lit face inside a dark outline becomes a hole in the wall. Off keeps today's solid-outline walls.

## Rules
- The foot (below the 15 mm minimum wall height) stays solid, so the tabs and the seat are untouched.
- The top edge still comes from the existing rim profile (spike widening and notch filling included); inside it, the wall is solid where the mapped pixel is dark and open where it is light. The zone added by spike widening stays solid.
- Printability, on a 0.4 mm grid: dark strokes narrower than the minimum spike width are thickened; openings narrower than the minimum notch width are filled; solid pieces not connected to the foot ("islands", such as an eye inside a lit face) are joined to the nearest connected solid with a bridge as wide as the minimum spike width; an island with nothing to join is dropped. The user is told how many were bridged and dropped.
- Wall outlines and openings use the cylinder mode's smooth contour tracing and constrained triangulation, so openings are smooth, not stair-stepped, and the mesh is watertight.
- Tealight shade mode and the cylinder mode do not change (their files are only imported, never edited).

## Non-goals
Other box sizes; perforating the panel; lit areas that a wall cannot reach (those mapping outside the wall's height range stay as the top edge makes them).
