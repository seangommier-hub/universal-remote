# ADR-HEARTH-135: Slightly tighter padding so the remote fits an iPhone 17 without scrolling

**Date:** 2026-09-25
**Status:** Accepted, implemented; fit not yet confirmed on a real iPhone 17

## Context

Sean: "reduce the padding slightly on the front remote page so it fits cleanly on the iphone 17
screen without scrolling." ADR-HEARTH-134 had made the utility buttons taller (32pt to 52pt),
adding roughly 20pt of height to a page already tuned to avoid scrolling (ADR-HEARTH-016 era).

## Decision

Padding only, no controls resized or removed (spacing tokens in `UniversalTvRemote.tsx`):
- Page content padding `lg` (16) to `md` (12).
- Base card padding `lg` to `md`, and inner gap `md` to `sm`.
- Utility card: vertical padding `xl` (24) to `md`, horizontal `xl` to `lg`, bottom margin `lg` to `sm`.

Rough saving is 50-60pt of height, more than the ~20pt the larger utility buttons added.

## Consequences

- Not measured on a device. The screen also shares the window with the bottom tab bar, so a TV with
  every section active (Samsung's seven utility buttons plus keypad and keyboard tabs) may still scroll.
- If it still scrolls by a few points on the iPhone 17, the next levers are the streaming/input
  card padding and the d-pad's vertical padding, in that order.
