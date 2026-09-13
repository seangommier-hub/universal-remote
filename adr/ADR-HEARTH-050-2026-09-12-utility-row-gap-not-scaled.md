# ADR-HEARTH-050: Utility row's Settings/Sleep wrap gap wasn't scaling with device size

Date: 2026-09-12

## Status

Accepted.

## Context

Sean reported the Settings gear icon "overlaying multiple things" in the TV remote's utility row — the third time this exact symptom has been reported (ADR history: 2026-09-10 twice, now 2026-09-12), despite two prior fixes (flexWrap for the row, fixed-width + numberOfLines on each label). Both prior fixes addressed real causes but left one more: `utilityRow`'s `gap` (theme.spacing.sm, unscaled) sets both the horizontal spacing between same-row icons and the vertical spacing between a wrapped first/second line. Only the icons themselves scale up via `useResponsiveScale` (tuned specifically for larger phones — Sean's is an iPhone 17 Pro). On a large screen, bigger icons close in on that same fixed vertical gap from both sides, reading as overlap even without literal pixel collision — a case the prior fixes' 375pt-baseline arithmetic didn't cover, since it doesn't vary by scale at all.

## Decision

Split `utilityRow`'s single `gap` into `columnGap: theme.spacing.sm` (horizontal, unchanged — keeps the already-verified "4×64 + 3×8 = 280px" fit for LG's 4-item case) and `rowGap: theme.spacing.lg` (vertical, larger, specifically for Samsung's 6-item wrapped case where a second row exists at all).

## Consequences

- LG/Roku/Sony's single-row utility layouts are visually unaffected (rowGap only matters when a wrap actually occurs).
- Samsung's wrapped second row (settings/sleepTimer) gets real, scale-independent clearance from the first row.
- Not yet visually confirmed on Sean's actual device — next real step is his own reload/check, same as every other fix tonight.

## Related

UniversalTvRemote.tsx `utilityRow`/`utilityAction` history (comments at the same style block), ADR-HEARTH-024, ADR-HEARTH-026, [[ADR-HEARTH-049]]
