# ADR-HEARTH-036: Streaming Apps row spreads to fill its full width

**Date:** 2026-09-10
**Status:** Accepted

## Context

Sean, on the phone app: "the top level of the app on the page with the
choice of app has things that need to be spread out and spaced properly."
"The page with the choice of app" is the Streaming Apps row on the main
remote screen (ADR-HEARTH-023) — four tiles (Netflix/Hulu/Prime
Video/YouTube) that launch an app on the TV, i.e. literally where you
choose which app to open.

That row's four tiles are a fixed `width: "22%"` each with a fixed
`gap: theme.spacing.sm` (8px) between them — deliberately NOT `flexGrow`
(ADR-HEARTH-023's own comment: flexGrow + flexWrap previously let the
"prime video" wordmark's extra width push the 4th tile onto its own
wrapped row, stretching it to a different size than the other three — a
real, already-fixed bug). But 4 × 22% = 88% of the row's width, leaving
~12% unused on the right since a plain `flexDirection: "row"` with no
`justifyContent` set packs children to the start. The tiles read as
clustered left rather than filling the card, which is what "needs to be
spread out" was describing.

## Decision

`streamingRow` gains `justifyContent: "space-between"` in place of the
fixed `gap`. This redistributes the row's leftover width as the space
between tiles instead of leaving it stranded past the last tile — it does
not touch any tile's own width or sizing logic, so the flexGrow/flexWrap
bug ADR-HEARTH-023 already fixed can't recur (that bug was about how each
tile's own width was computed, not about how the parent row lays out its
fixed-width children).

## Consequences

- `tsc --noEmit` clean, all 190 Jest tests still pass (this is a
  style-only change; the test suite doesn't cover RN layout geometry).
- Not yet verified on Sean's real phone/TV — next real checkpoint is him
  looking at the Streaming Apps row again.
