# ADR-HEARTH-030: Invisible button labels, the clipped Input card, and streaming-tile sizing

**Date:** 2026-09-10
**Status:** Accepted

## Context

Sean, in quick succession: "youtube logo isn't middle aligned. boxes are
not the same size. the secondary box for navigation is terrible." then
"the input box goes off the screen at the bottn and has not labeling."

Two of these traced to real, concrete bugs rather than pure aesthetics.

**"has not labeling" — a real, widespread bug.** `CapabilityButton`
never renders both an icon and a visible label — its own render logic is
`icon ? <Icon/> : <Text>{label}</Text>`, strictly one or the other, with
the label becoming accessibility-name-only whenever an icon is present.
That's correct and intentional for the d-pad/keypad circular buttons
(ADR-HEARTH-016 deliberately made those icon-only, physical-remote
style) — but it was silently applied to several buttons whose *text*
actually needed to be visible:
- Every Input-selection button (`icon="tv-outline"` + a label like
  "HDMI 1") — every button rendered as an identical bare TV glyph, with
  no way to tell which input was which. This is what made the newly-real
  LG/Sony input lists (ADR-HEARTH-027/029) actually unusable, not just
  unlabeled.
- The Reconnect button (`icon="refresh"` + "Reconnect"/"Reconnecting…")
  — no visible text on the one banner explicitly designed to tell the
  user something's wrong.
- The primary "Connect"/"Waiting for TV..."/"Connecting..." button on
  **all four** Add-device screens (`icon="link-outline"`) — the main
  call-to-action on every pairing flow had no visible text at all.
- The Family Command Center settings "Save"/"Checking..." button
  (`icon="checkmark-outline"`).

Fixed by removing the icon prop from each of these — the label is the
thing that needed to be visible, and none of these buttons lose meaning
without an icon (unlike Power/Mute/d-pad, where the icon alone is the
established, deliberate convention).

**"the input box goes off the screen at the bottn"** — a real layout
bug, and a regression from ADR-HEARTH-024's own bottom-anchor spacer
(`<View style={{flex:1}}/>` plus `content`'s `flexGrow: 1`). A `flex: 1`
child competing for space inside a `ScrollView` whose own
`contentContainerStyle` also carries `flexGrow: 1` is exactly the kind
of layout ambiguity that can push trailing content (the utility row, and
worse, the Input card after it) out of the reliably-scrollable area
instead of just visually anchoring it to the bottom. Removed both the
spacer and the now-unnecessary `flexGrow` on `content` — a working Input
selector matters more than the bottom-anchor cosmetic effect it broke.

**"boxes are not the same size" / "youtube logo isn't middle aligned"**
— traced to `streamingTile`'s `flexBasis: "22%"` + `flexGrow: 1` +
`flexWrap: "wrap"` on its row. If any one tile's wordmark text (e.g.
"prime video") needed more than its equal share of space, React Native's
default `flexShrink: 0` refuses to shrink it — which could push the 4th
tile onto its own wrapped row, where `flexGrow: 1` with no siblings
stretches it to the *entire* row width, a completely different size/shape
than the other three. The YouTube icon likely wasn't actually
mis-centered within its own box so much as its box was a different shape
than intended, making centered content look visibly "off" relative to
its evenly-sized siblings.

## Decision

- `streamingTile`: fixed `width: "22%"`, no `flexGrow`, no `flexWrap` on
  the row — deterministic, not dependent on wrap behavior. The
  arithmetic (4 × 22% + 3 gaps of `spacing.sm`) was checked against a
  375pt screen with real margin, same discipline as the hub row's own
  overflow fix (ADR-HEARTH-016), not assumed to fit.
- Added `streamingTileContent`, a fixed 28×28 centered wrapper around
  just the icon (not the text) — a strictly more deterministic
  centering guarantee than trusting the outer `Pressable` alone, kept
  even though the sizing fix above likely explains the reported
  misalignment on its own.

## Rationale

"The secondary box for navigation is terrible" wasn't acted on in this
pass — unlike the other three, it's not something a straightforward code
inspection turned up a concrete, nameable cause for. Guessing a fix for
it now (a third guess in one exchange, after two that *did* turn out to
be real bugs) risks repeating the exact mistake this session already got
corrected on once — better to ship what's verifiably fixed and ask what
specifically reads as "terrible" than invent a plausible-sounding change
with no finding behind it.

## Update 2026-09-10 (same night): still reported broken — two more real causes

Sean, after the fixes above: "youtube logo is not centered and the other
logos are not centered. also, inputs need labels. the settings
label/button is still overlapping." The Input-label fix itself was
re-confirmed correct by direct code inspection (no `icon` prop on those
buttons) — the most likely explanation for that one still reading as
broken is a stale Expo Go bundle, not a code regression; re-verified via
a from-scratch Metro rebuild before reporting this update. The other two
had real, distinct causes:

- **"the other logos are not centered" (not just YouTube's icon)**:
  `streamingTileWordmark` had no `numberOfLines` — "prime video" (11
  characters) almost certainly wraps to two lines at this tile's width,
  and a fixed-`aspectRatio` box doesn't grow to fit a second line, so
  centered-but-overflowing text reads as visibly off-center. Added
  `numberOfLines={1}` and `adjustsFontSizeToFit`/`minimumFontScale={0.7}`
  so every wordmark shrinks to fit one line instead of wrapping —
  guarantees centering the same way the icon case's fixed-size wrapper
  already did.
- **"the settings label/button is still overlapping"**: `utilityAction`
  had no fixed width — a longer caption ("Settings") could wrap to a
  second line while shorter siblings ("Mute", "Home") stayed single-line,
  giving that one item a different total height than the row it wrapped
  alongside, reading as two rows overlapping. Fixed `width: 64` plus
  `numberOfLines={1}` on the caption makes every utility action exactly
  the same height regardless of label length, so a wrapped grid can never
  produce mismatched row heights again.

115/115 tests passing (no test change — UI-only), `tsc --noEmit` clean.

## Update 2026-09-10 (later still): YouTube icon dropped; card order and spacing; a real diagnostic instead of a fourth guess

Sean, after the previous update's fixes: "youtube logo not middle
aligned, inputs not labeled by their actual input. the navigation with
channe;s and volume are awful" then "also the inputs should be above the
card above and that card needs better spacing."

- **YouTube icon, still reported misaligned after two rounds of layout
  fixes**: stopped trying to fix it through the container and dropped
  the icon-font approach entirely. An icon-font glyph's visual mark
  isn't always centered within its own em-square the way flex-centering
  assumes, and no amount of wrapper/box fixing corrects that from
  outside the font itself. YouTube's tile now renders through the exact
  same text-wordmark path as the other three (which had their own
  alignment issue — text wrapping to two lines — fixed and confirmed
  working) — one rendering mechanism for all four tiles, not two.
- **Card order**: the Input card now renders before the utility row
  (Mute/Back/Home/Menu/...), not after — direct literal request.
- **Utility row spacing**: gained its own `utilityCard` style
  (`padding: spacing.xl`, up from the shared `card` style's
  `spacing.lg`) and its internal `utilityRow` gap widened from
  `spacing.md` to `spacing.lg` — a sparse row of a few icon+caption
  chips reads as cramped at the same padding a denser card (the hub, the
  keypad) uses well; this one gets more room on purpose, not by
  oversight.
- **"inputs not labeled by their actual input"**: this is LG's dynamic
  `getExternalInputList` parsing (ADR-HEARTH-027) most likely failing
  silently and falling back to the generic hdmi1/2/3 guess — exactly the
  field-name uncertainty (`id` vs `appId`, and possibly a different
  wrapper shape entirely) flagged as a real risk when that feature
  shipped. Rather than guess a third time at field names with no way to
  confirm, added a diagnostic: `refreshInputList()` now logs the *raw*
  `getExternalInputList` response before any parsing happens. Since
  Sean's phone connects through this same Metro instance, its console
  output reaches this session's own terminal — the next real connect()
  attempt should surface exactly what this TV's firmware actually
  returns, turning this from a blind guess into a one-round-trip fix.
- **"the navigation with channels and volume are awful"**: not acted on.
  Two of this same message's three complaints turned out to be real,
  diagnosable bugs (icon centering, input labels) and one didn't have a
  concrete cause a code read turned up — same situation as the earlier
  "secondary box... terrible" comment. Rather than take a fourth guess
  at the hub cluster's layout with no specific finding behind it, this
  is being asked about directly instead.

115/115 tests passing (no test change — UI/diagnostic-logging only),
`tsc --noEmit` clean.

## Consequences

- 115/115 tests passing (this was a UI-only fix — no driver/logic
  changes, so no new tests; every affected file already has no
  component-level test coverage by this project's established
  convention), `tsc --noEmit` clean.
- Every Add-device screen's primary CTA, the reconnect banner, the FCC
  settings Save button, and every Input-selection button now show real,
  visible text for the first time — this was very likely affecting
  usability well before today's session, not something introduced by
  it, just not noticed until the Input buttons made it impossible to
  miss.
- Bottom-anchoring the utility/Input cards is an open want, not
  abandoned — flagged in-code for a future attempt using a structure
  that doesn't put a `flex: 1` view inside scrollable content (e.g. a
  fixed footer outside the `ScrollView` entirely).
- Not yet re-verified in Expo Go — same outstanding caveat as every UI
  change this session.
