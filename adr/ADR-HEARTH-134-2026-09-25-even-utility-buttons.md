# ADR-HEARTH-134: Evenly spread, real-looking utility buttons

**Date:** 2026-09-25
**Status:** Accepted, implemented; not yet seen on a real phone

## Context

Sean: "clean up the home menu back etc. buttons." ADR-HEARTH-121 had shrunk that row to small 32pt
transparent circles so it fit one wrapping line, which left them looking like loose icons.

## Question asked (ADR-GLOBAL-002)

Options offered: evenly spread in one row; a back/home/menu group beside the d-pad; bigger
icons-only. Sean: **"evenly spread with icons so that they look like buttons."**

## Decision

- Each utility action is a filled, bordered 52pt circle (the default button style, previously the
  transparent "ghost" style at 32pt) with its caption under it.
- Equal-width columns instead of a wrapping row with fixed-width chips: up to 5 buttons stay on one
  row (preserving ADR-HEARTH-121's one-row goal), 6 use 3 columns, 7-8 use 4, so a second row is
  even. Order is unchanged (Home, Menu, Mute, Back, then Settings/Sleep/Source, per Sean's
  2026-09-11 request).
- This reverses ADR-HEARTH-121's 32pt "xs" size for this row on Sean's new instruction; the `xs`
  size stays available in CapabilityButton.

## Consequences

- Bigger touch targets (52pt vs 32pt) at the cost of less spare width; five buttons on a narrow
  phone leave about 65pt per column, which still fits.
- Not checked on a device; a phone with a very large text size may wrap a caption.
