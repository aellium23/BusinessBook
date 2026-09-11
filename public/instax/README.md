# The funnel photograph

`desk.png` is the artwork behind the Funnel dashboard — the whole scene as it
was made. It is 1536 × 1024, and that matters: every box in
`src/components/dashboard/InstaxFunnel.jsx` is a measurement in those pixels.
Where each white card sits, where the picture inside it starts, where the tape
carrying the conversion is stuck, where the paper strip lies and how its two
edges fall. The page draws the live figures over the frames in the photograph
and cuts each frame's picture out of this same file at display time, so there is
no second copy of anything to keep in step.

Two of those measurements were not obvious and cost a render each. The white
cards need five pixels of overhang or a pale line of the painted card shows down
each side, because the printed card has a soft shadow the measurement does not.
And the bottom edge of the paper strip is not straight: it falls gently for most
of its length and then five times as fast over the last two hundred pixels,
where the paper curls away from the camera — a single straight line left a cream
sliver showing under the film for its whole width.

Replacing the artwork means re-measuring. If a new version of the scene is
dropped in with the frames anywhere else, the live cards will sit beside the
painted ones rather than on top of them. The constants to revisit are `FRAMES`,
`CARD_TOP` / `CARD_BOTTOM`, `PHOTO_TOP` / `PHOTO_BOTTOM`, `PHOTO_INSET`, `TAPE`,
`STRIP`, `WOOD`, `COLUMNS` and the two edge functions. The way to check is to
look at it rather than to reason about it: render the page at 1536px wide and
see whether any edge of the painted scene shows along a drawn one.

The numbers are never baked into the picture. A figure inside a photograph is
stale the moment it is taken, and this one is read from the deals every time the
page opens.
