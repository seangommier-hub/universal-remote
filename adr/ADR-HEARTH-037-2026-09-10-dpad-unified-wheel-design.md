# ADR-HEARTH-037: D-pad reads as one wheel, not four separate buttons

**Date:** 2026-09-10
**Status:** Accepted

## Context

Sean: "do the design agent on the arrows on the front page" — the D-pad
(up/left/right/down chevrons plus the center Select button) on the main
remote screen. Functionally correct and already alignment-fixed
(ADR-HEARTH-016's real-device rocker-column fix), but visually the four
directional arrows were just four instances of the same generic
`CapabilityButton` circle used everywhere else in the app (utility row,
volume rocker, keypad digits) — indistinguishable chrome for what's
actually the single most-used control on the screen. A real remote's d-pad
is one physical wheel, not four separate switches wired up next to each
other.

## Decision

The `dpad` container becomes a circular disc (`borderRadius:
theme.radius.full`, `backgroundColor: theme.surfaceRaised` — one step up
the app's existing tonal-elevation ladder from the surrounding
`hubCard`'s `theme.surface`, so it reads as a distinct raised control, not
a flat backdrop) that the four arrows sit ON, rather than four boxed
buttons sitting NEXT TO each other on the card's own background.

Made possible by something the layout already had, not a new constraint:
`DPAD_HEIGHT` (196px, from the ADR-HEARTH-016 rocker-alignment fix) is
also exactly the middle row's width (52+12+68+12+52 = 196) — the d-pad's
bounding box was already a perfect square. Giving the container that same
fixed width/height plus full border-radius turns it into a circle the
existing button positions already fit inside: each arrow (52px, centered
72px from the disc's center) reaches exactly 98px at its outer edge —
precisely the disc's own radius, so every arrow sits tangent to the rim
with no clipping and no wasted margin.

The four directional buttons get `containerStyle={{ backgroundColor:
"transparent", borderWidth: 0 }}` via `CapabilityButton`'s existing
`containerStyle` escape hatch (built for exactly this kind of one-off
override) — this removes their individual box chrome so they read as
icons floating on the shared disc, not competing rings. The center Select
button is untouched — still boxed and accent-colored, the one control
that should stand out from the rest.

## Consequences

- `tsc --noEmit` clean, all 190 Jest tests still pass (style-only change).
- No new component, no new `CapabilityButton` variant — reused the escape
  hatch that already existed for exactly this kind of call-site-specific
  override, and only this one call site uses it.
- Not yet verified on Sean's real phone — next real checkpoint is him
  looking at the d-pad again.
