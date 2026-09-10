# ADR-HEARTH-026: Snap every spacing value to the theme's own scale

**Date:** 2026-09-10
**Status:** Accepted

## Context

Sean: "the spacing needs an update across the board." An audit
(`grep`ing every `padding`/`margin`/`gap` in `src/ui/*.tsx` for a
hardcoded number rather than a `theme.spacing.*` reference) found the
codebase had drifted from its own stated system: `theme.ts` defines a
`spacing` scale (`xs`4, `sm`8, `md`12, `lg`16, `xl`24, `xxl`32) precisely
so no screen hardcodes a spacing number, but 20+ call sites across
`CapabilityButton.tsx`, `DeviceListScreen.tsx`, `DiscoverDevicesScreen.tsx`,
and `UniversalTvRemote.tsx` used near-miss literals instead (13, 14, 18,
10, 6, 4, 2) — values close to a token but not equal to one, accumulated
piecemeal across many edits rather than any deliberate choice.

## Decision

Every one of those values snapped to the nearest existing token — no new
tokens added, no scale redesign:
- `CapabilityButton.tsx`: button padding 13/18 → `md`/`lg`; icon-label gap
  8 → `sm` (exact value, just wasn't referencing the token).
- `DeviceListScreen.tsx` / `DiscoverDevicesScreen.tsx`: tile padding 14
  → `md`; the several `marginTop`/`marginBottom: 2` or `4` micro-nudges
  → `xs`; discover-screen connect button 10/16 → `sm`/`lg`.
- `UniversalTvRemote.tsx`: every small pill/row/banner gap and padding
  (name-row gap, status pill gap/padding, reconnect/command-error banner
  spacing, tab bar padding/gap, tab padding, streaming tile padding) → the
  nearest of `xs`/`sm`, leaning tight/compact rather than loose — small
  chrome (pills, tabs, tile padding) isn't a touch target, so it can sit
  closer to the grid's small end than `CapabilityButton`'s own
  interactive-button padding does.
- Left `padding: 0` in `CapabilityButton.tsx`'s `circleButton` (an
  intentional reset for a button sized by fixed width/height, not part of
  the spacing rhythm) and every `paddingTop: 56`/`64` safe-area offset
  alone — those aren't inter-element spacing, they're device safe-area
  clearance, a different kind of value than this pass was about.

## Rationale

This is a consistency fix, not a taste call — every value already had a
"correct" answer (theme.ts's own scale), just wasn't using it. Rounding
direction (tight vs. loose) only mattered for the handful of genuinely
equidistant cases (14 between 12/16, 6 between 4/8); resolved those
toward tighter/denser, matching this session's already-established
direction (ADR-HEARTH-016: "a physical remote's controls sit close
together").

## Consequences

- 109/109 tests passing (no behavior change — every snap is a few-pixel
  visual adjustment, not a logic change), `tsc --noEmit` clean.
- A full-codebase grep for `(padding|margin|gap)[A-Za-z]*: [0-9]+` outside
  `theme.spacing` now returns only that one intentional `padding: 0`
  reset — confirmed clean, not assumed.
- Not yet visually re-verified in Expo Go — same outstanding caveat as
  every UI change this session.
