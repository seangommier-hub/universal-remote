# ADR-HEARTH-216: Command Center button — clearer label, own full-width row

## Status

Accepted

## Context

Two direct, quick follow-ups from Sean (2026-10-07) on reviewing the just-added Command Center
button (ADR-HEARTH-213) and Touchpad button (ADR-HEARTH-215) in the utility row:

1. "why is it called, call center and not command center?" — the idle-state label read "Call
   Center," which is a real, unrelated thing (customer-service call centers), not an obvious
   reading of "tap to call [the] Command Center." Every other button in this row (Home, Menu, Mute,
   Settings, Touchpad) is a noun naming its destination/action, not a verb phrase — "Call Center"
   broke that pattern on top of being ambiguous.
2. "you can make command center it's own button full width below those buttons" — pull it out of
   the icon-chip grid (`UtilityAction`, small icon-over-caption circles sized for a device's own
   TV-control buttons) into its own full-width row below the grid.

## Decision

- `UtilityActionsRow.tsx`: idle-state label changed from "Call Center" to "Command Center" (the
  `checking`/`reached`/`unreachable` labels — "Calling…"/"Reached"/"No Answer" — were already
  unambiguous process/result descriptions, left as-is).
- The Command Center button moved out of `styles.utilityRow`'s `UtilityAction` grid into its own
  `CapabilityButton` (`shape="pill"`, the component's normal icon+label-inline style, not the
  small icon-over-caption chip) rendered full-width (`width: "100%"`) directly below the grid,
  inside the same card.
- `deriveRemoteViewState.ts`'s `utilityButtonCount` (drives the grid's own column math,
  ADR-HEARTH-134) no longer counts the Command Center button — it stopped being part of that grid,
  so it no longer affects the grid's column layout. It briefly did, under ADR-HEARTH-213.

## Consequences

- Visually distinct from the TV-control buttons, matching that it's conceptually different (calls
  Family Command Center, not the TV) — the destination/noun naming is now consistent across the
  whole row too.
- No change to when or why the button is shown (every TV, unconditional) or what it does on press
  — purely a label and layout refinement.
- Folded into the still-open Touchpad PR (ADR-HEARTH-215) rather than a separate PR, since both
  touch the exact same row in the exact same unreviewed change.
