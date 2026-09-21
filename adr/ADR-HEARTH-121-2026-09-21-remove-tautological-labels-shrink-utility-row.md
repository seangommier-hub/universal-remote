# ADR-HEARTH-121: Remove tautological card labels; shrink utility row to fit one line

**Date:** 2026-09-21
**Status:** Accepted, implemented

## Context

Sean, directly: "remove the streaming apps and inputs labels from the cards on the page as they
are tautological. reduce the button size to make the bottom card one row."

## Decision

**Tautological labels removed**: the "Streaming Apps" label above the streaming-service tile row
and the "Input" label above the input-selection grid are both gone. Neither card needed a caption
— a row of Netflix/Hulu/Prime/YouTube tiles and a grid of HDMI/input buttons are both
self-evident from their contents. `styles.cardLabel` itself is untouched (still used by the
Volume & Channel card, the Channel Number keypad header, and the Type-on-the-TV keyboard header,
none of which are tautological the same way).

**Utility row (the last/bottom card — Home/Menu/Mute/Back/Settings/Sleep/Source) forced to one
line.** Samsung's real capability set is the actual worst case: 7 simultaneous items
(home/menu/mute/back/settings/sleepTimer/openSourceList) — this row's own prior history (see git
blame) had already tuned itself around a smaller item count and explicitly treated Samsung's wrap
as "expected, not a bug." That's no longer true by design.

Added a new `circleDiameter.xs` (32px) tier to `theme.ts` and threaded it through
`CapabilityButton.tsx` as `size="xs"` (alongside the existing `sm`/`lg`) — a real, named token
following this project's own "no magic numbers" standard, not an inline override. `UtilityAction`
now renders at `size="xs"` with a 36px item width (down from 64px), and `utilityRow`'s gap
tightened from `spacing.sm` (8px) to `spacing.xs` (4px).

Verified arithmetic (this row has a real history of underestimated math — reported broken three
separate times before this ADR): 7 × 36px + 6 × 4px gaps = 276px, against the card's ~295px
available content width (375pt baseline − 32px outer content padding − 48px utilityCard's own
padding) — 19px of margin, deliberately more generous than this row's prior fixes left themselves.
`flexWrap`/`rowGap` are kept in place as a defensive fallback only, not expected to trigger for any
current driver's capability set — a future driver adding an 8th+ item degrades to a second line
rather than clipping off-card.

## Consequences

- A real, acknowledged tradeoff: utility-row touch targets shrink from 52px to 32px diameter,
  below the commonly-cited ~44pt accessibility guideline. Deliberate, per Sean's explicit
  instruction to prioritize the one-row layout — not an oversight.
- `size="xs"` is now a reusable option on `CapabilityButton` for any future call site that needs
  the same tradeoff, not a one-off inline hack scoped to this file.
- No dedicated automated test file exists for `UniversalTvRemote.tsx` (this project's established
  convention — verified via `tsc --noEmit` and the existing 939/939 suite, neither of which
  regressed). Not yet live-verified on a real device — flagged honestly per this row's own history
  of arithmetic that looked right until tested against real hardware.
