# ADR-HEARTH-041: Hulu wordmark scale, 3-column input grid, unified rocker/d-pad wheel

Date: 2026-09-11

## Status

Accepted.

## Context

Sean: "adjust the size of the hulu button to match, change the arrangement
of the inputs to be fewer rows and the fix the navigation of the up down
arrows for volume and navigation to be more neatly oriented. i realize
this is not a normal remote and it cant be designed perfectly like one but
these changes will make this better." Three separate, real design asks on
`UniversalTvRemote.tsx`, addressed without a live screenshot — each traced
to an actual, verifiable cause in the current code rather than guessed
blind.

## Decision

**Hulu wordmark.** All four streaming tiles already share one box style
(`streamingTile`: same width/aspectRatio, ADR-HEARTH-036) — the size
mismatch isn't the box, it's the wordmark. Hulu's real logotype is short
and entirely lowercase; at an identical declared font size, lowercase
text has a shorter x-height than "NETFLIX"'s all-caps or "YouTube"'s
mixed-case, so it reads smaller even though nothing about its layout
differs. Added an optional per-entry `fontScale` (default 1 — every
other tile renders byte-identical to before) and set Hulu's to 1.35.

**Input grid.** The Input card used the same generic `styles.row`
(`flexWrap`, no column count) as several unrelated call sites — row count
varied with however many buttons happened to fit per line, so a TV
reporting several inputs with longer names (`Component`, `Antenna`) could
wrap down to 2 per row, stretching a 6-7-input list to 3-4 rows. Added a
dedicated `inputGrid`/`inputTile` (3 fixed columns, `flexBasis: "31%"`,
no `flexGrow` — same technique `DeviceListScreen`'s own 2-column grid
already uses, and no `flexGrow` for the same "remainder tile shouldn't
stretch to fill its row alone" reason ADR-036's streaming-row fix
documents) — deterministic `ceil(inputs/3)` rows regardless of label
length. `CapabilityButton` gained an optional `numberOfLines` prop
(undefined by default, every existing call site unaffected) so a longer
input label can't wrap to two lines and give just that one tile a
different height than its row-mates — the same bug class the utility
row was already fixed for.

**Rocker/d-pad orientation.** The d-pad's own top-to-bottom alignment
with the Vol/Ch rockers was already fixed (documented inline, same-day
comment: "their up/down buttons sat ~30px away... instead of aligning").
What was left: the d-pad reads as one wheel (ADR-HEARTH-037 — a shared
disc the four arrows sit on) while the rockers beside it were still two
bare floating circles directly on the card's own background — one
control styled differently from its two neighbors. Gave each rocker
column the same disc treatment (`theme.surfaceRaised` fill,
`theme.border` outline, `ROCKER_WIDTH = theme.circleDiameter.lg` — reused
rather than a new magic number, already the d-pad's own Select-button
diameter) and made its Up/Down buttons transparent (`containerStyle:
styles.dpadArrow`, the exact style the d-pad's own arrows already use)
so they sit ON the disc instead of drawing their own competing circle
outline. All three columns now read as one consistent family of wheel
controls.

## Consequences

- 190/190 tests passing (style-only changes; this codebase has no RN
  component-rendering coverage, consistent with every other UI-only
  change tonight), `tsc --noEmit` clean.
- Not yet visually confirmed on Sean's phone — every fix here is
  reasoned from the actual current code and verified arithmetic (matching
  this project's established practice for prior layout fixes:
  ADR-HEARTH-016, -036, -037), not from a live screenshot, since none was
  available this session.
- If Sean's actual intent for "more neatly oriented" was something
  different than the wheel-family treatment chosen here (e.g. a literal
  joined volume-rocker switch, closer to a physical remote's single
  up/down paddle), that's a bigger, separate redesign — flagged as the
  next candidate if this pass doesn't land right, not attempted here on a
  guess.

## Update 2026-09-11: the rocker-disc change broke the hub row's own width fit

Sean, immediately after: "i want the remote page to be 1 page, now the
icons at the bottom span two lines." Two real regressions, both from
gaps in verified-width arithmetic:

1. The rocker's `circleDiameter.lg` (68) disc width added ~32px to the
   hub row, 21px past the 375pt-screen budget ADR-HEARTH-016 already
   established (316px, ~11px spare). Reverted to `circleDiameter.sm`
   (52 — the button's own diameter) so the disc costs zero extra width
   over the plain circle it replaced.
2. Separately, and not caused by tonight's changes: the utility row's
   own width was never verified the way the hub row was. Even LG's
   plain 4-item set (no settings gear at all) needed 304px against
   ~295px available at the row's `spacing.lg` gap — a real, pre-existing
   9px overflow forcing an unwanted wrap. Tightened to `spacing.sm`.

190/190 tests passing, `tsc --noEmit` clean. Also resolves what Sean
described separately as "a lingering item under the settings gear" —
traced to the same utility-row wrap (a literal `settings-outline` icon
exists in that row for Samsung's `settings` capability); LG's device
never had a gear at all, so eliminating LG's unwanted wrap removes the
only render path that could place a second-line item near one.
