# The funnel photograph

`desk.png` is the artwork behind the Funnel dashboard — the whole scene, frames
and all, exactly as it was made. It is 1536 × 1024, and that matters: every box
in `src/components/dashboard/InstaxFunnel.jsx` is a measurement in those pixels
— where each white card sits, where the picture inside it starts, where the
summary banner lies. The page draws the live figures over the frames in the
photograph, and cuts each frame's picture out of this same file at display time,
so there is no second copy of anything to keep in step.

Replacing it means re-measuring. If a new version of the scene is dropped in
with the frames anywhere else, the live cards will sit beside the painted ones
rather than on top of them. The measurements to revisit are `FRAMES`,
`CARD_TOP` / `CARD_BOTTOM`, `PHOTO_TOP` / `PHOTO_BOTTOM`, `PHOTO_INSET` and
`BANNER`, and the way to check is to look at it rather than to reason about it:
render the page at 1536 px wide and see whether any pale edge of a painted card
shows along a drawn one.

The numbers are never baked into the picture. A figure inside a photograph is
stale the moment it is taken, and this one is read from the deals every time the
page opens.
