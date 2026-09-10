# ADR-HEARTH-016: Remote screen redesign — rockers, hierarchy, and connection gating

**Date:** 2026-09-09
**Status:** Accepted

## Context

Sean: "it needs to be much more improved, use a design and ui agent and then
have them iterate and look at other mobile remotes." A design pass was
delegated to an agent with an explicit brief: research real remote-control
apps, form a concrete point of view (not generic polish), and iterate on
the actual code — not a mockup. Separately, live real-hardware testing
that same night surfaced a genuine connection-state bug in this same
screen, folded into this ADR since it touches the same file.

## Decision

**Research, sourced (not asserted from memory):**
- Apple's TV Remote app — confirmed the directional-pad center-click is
  the dominant control of that cluster (already partially reflected in
  ADR-HEARTH-009's d-pad).
- Samsung SmartThings' TV remote — volume and channel are paired vertical
  rockers, "the same way they would work on a normal remote" (Samsung's
  own support documentation), not side-by-side horizontal pill rows.
- The Roku app — has no numeric keypad at all, on the real device or in
  the app. Confirms Hearth's own `setChannel` keypad (ADR-HEARTH-015) is a
  genuine differentiator worth keeping prominent, not something to imitate
  away.
- Sky Q's remote app — keeps the d-pad and Home/Back visually distinct
  from volume/channel, rather than uniform button chrome throughout.
- General thumb-zone/button-hierarchy UX research — primary controls need
  generous, unambiguous touch targets; secondary/rare actions should
  recede rather than compete for equal visual weight.

**Concrete problems identified in the prior layout**, not generic
"make it nicer":
1. Volume and channel were two separate horizontal pill rows — no real
   remote lays them out that way; it read as a settings form.
2. Every section had identical card chrome and button size regardless of
   how often it's actually used — Power read no more prominent than Input;
   Back/Home/Menu (occasional OS navigation) competed visually with Volume
   (constant use).
3. The whole screen was a uniform-weight scrolling card stack, closer to a
   settings list than something meant to be held like a remote.
4. `DeviceListScreen`'s "Discover devices" tile (a one-time setup action)
   used a solid accent fill, louder than the actual device cards above it.

**Changes made** (`src/ui/theme.ts`, `CapabilityButton.tsx`,
`UniversalTvRemote.tsx`, `DeviceListScreen.tsx`):
- New `theme.circleDiameter` token (`sm: 52`, `lg: 68`) — no more magic
  numbers for circular touch targets, and a documented place to declare
  "this one control is the primary target on this screen."
- `CapabilityButton` gains an additive `size?: "sm" | "lg"` prop
  (circle-shape only; default `"sm"` reproduces prior behavior exactly).
  Used for exactly one control: the d-pad's center Select/OK button, the
  single highest-frequency touch target on the screen.
- Power moved out of card chrome into its own plain top-level row — a
  physical remote's power button isn't a labeled settings panel.
- Volume and Channel merged into one card as paired vertical rockers
  (up/label/down per column, Mute between them), replacing the two
  separate horizontal pill rows.
- Back/Home/Menu demoted to `variant="ghost"`, visually secondary relative
  to power/volume/channel/nav.
- Content spacing tightened (`spacing.lg` → `spacing.md`) for a denser,
  less "listy" feel closer to a physical control surface.
- `DeviceListScreen`'s discover tile changed from solid accent fill to an
  accent-outlined treatment, so it no longer outweighs the device list.
- Capability gating (`has()`) is untouched everywhere — every control is
  still individually gated exactly as before; only the grouping/visual
  weight changed. No device-brand-specific logic was introduced.

**Separate, same-file bug fix — connection-state gating:** live testing
that same night showed a device can appear in the list and its remote
screen render fully interactive before its background reconnect (see
`App.tsx`'s fire-and-forget reconnect loop, which can fail silently) has
actually completed — producing a raw, confusing "not connected — call
connect() before sending commands" error on tap. Every action control in
`UniversalTvRemote` now reads a new `controlsDisabled = !isConnected` and
disables itself accordingly, using the same `state.connection` value the
status pill already displayed but never gated on.

## Rationale

Grounding every layout call in a cited real app or a specific, named
problem (rather than "it needs to be much more improved" taken as license
for arbitrary changes) keeps this in scope and reviewable — every change
above traces to either a sourced pattern or an observed defect, not taste
alone. The connection-gating fix belongs in this ADR rather than a
separate one because it touches the identical file for a directly related
reason: a control surface that looks interactive but silently isn't is the
same class of problem as one that's laid out wrong.

## Update 2026-09-09 (same night, later still): Power belongs in the top corner, not a centered row

Sean, directly, after looking at the design: "power off should be top left
or right." Checked this against a real reference rather than taste alone —
LG's own official ThinQ remote app (the same brand this project's real
hardware is) puts Power in a compact top row alongside volume/mute/home,
not as a large standalone centered button. That's also how virtually every
physical remote is laid out: power is a top-corner icon, never a hero
control competing with volume/channel/nav for center-of-screen attention.

Moved Power out of its own dedicated row and into the header, as a small
circular icon button in the top-right corner next to the device name —
`headerRow`/`headerText` in `UniversalTvRemote.tsx`. Removes an entire row
of vertical space too, a small additional win toward "shouldn't require
scrolling." 95/95 tests passing, `tsc --noEmit` clean.

## Consequences

- `tsc --noEmit` clean; 91/91 tests passing (no test files changed — this
  project has no component-level UI tests by established convention,
  verified via Expo Go instead; `CapabilityButton`'s new `size` prop and
  the rocker layout are unverified by any automated test for the same
  reason every other screen component already is).
- **Not yet verified on a real device.** Neither the redesign nor the
  connection-gating fix has been seen in Expo Go on an actual iPhone —
  font rendering, touch feel, safe-area insets, and real `ScrollView`
  behavior are all unconfirmed. A structural HTML reconstruction (theme.ts
  values, iPhone-width viewport) was used mid-pass to sanity-check
  overlap/spacing only; it was deleted afterward and proves nothing about
  native fidelity. This is the next real checkpoint.
- If a future driver needs a second "primary" control beyond one d-pad
  Select per screen, revisit whether `size="lg"` should support more than
  a binary sm/lg split — not extended speculatively now.

## Update 2026-09-09 (same night, later still): silent command failures

Found during a proactive review pass (no scroll/reconnect bug left to hunt
after ADR-HEARTH-017's fourth race, so the review turned to this screen's
own remaining gaps): `send()` called `commandEngine.execute(...)`
fire-and-forget, with no `await` and nothing reading the result.
`CommandEngine.execute()` deliberately never throws — it always resolves a
`CommandResult`, success or failure — so a failed command (TV rejected the
request, a transient drop mid-press) simply vanished. The user's only
signal was the button visibly doing nothing, with no indication whether it
failed, was still in flight, or silently succeeded with no visible TV
effect. This is a plain correctness/error-handling gap, not a style
choice — no design research needed to justify surfacing an error that was
being thrown away.

Fixed in `UniversalTvRemote.tsx`: `send()` now reads the result and, on
failure, shows a small dismissible-by-timeout banner (`commandError` state,
auto-clears after 4s) with the driver's actual error message, styled with
the same `statusError`/`statusErrorSoft` tokens the existing reconnect
card already uses — not a new visual language, reusing what's already on
screen. Only shown while `isConnected`, since the existing reconnect card
already owns the disconnected case. Cleared on device navigation so a
stale error from a previous screen can't linger.

97/97 tests passing (no new UI test — same established convention noted
above), `tsc --noEmit` clean. Still unverified in Expo Go on a real device,
same outstanding caveat as the rest of this screen.

## Update 2026-09-10: real reference image supplied — merged control hub

Sean, after repeated "ugly" feedback this session couldn't act on without
guessing (and one earlier unfounded design claim he explicitly called
out), sent an actual reference image of a home-theater remote app: "this
is more what i am looking for." This is the sourced, concrete reference
this screen's earlier design work was missing — not a new guess, a
correction against real evidence.

Concrete differences identified against the reference, and what changed:

1. **Volume/channel rockers merged directly beside the d-pad as one
   cluster**, not stacked as a separate card above it — the reference's
   "Everything in One Place" framing. `hasDpad` now gates a single
   `hubCard` containing `[Vol rocker] [d-pad] [Ch rocker]` in one row.
   Sony (no `directionalNavigation`, no channel keys) has no d-pad to
   anchor that cluster to, so it keeps the older standalone volume-only
   card as an explicit fallback — the merge only applies where there's
   something to merge around.
2. **Soft ambient glow behind the hub**, echoing the reference's warm ring
   light around its own d-pad — a single `accentSoft`-tinted circle,
   absolutely positioned and centered behind the control cluster
   (`hubGlow`), not a new color, reusing the existing tinted-badge token.
3. **Mute moved out of the volume rocker into a secondary utility row**
   alongside Back/Home/Menu, restyled as icon-over-caption chips
   (`UtilityAction`, a small local component — this exact pairing repeats
   four times in one row) rather than horizontal icon+text pills. Matches
   the reference's own Mute/Voice/Scenes/More row shape; Voice and Scenes
   don't exist as Hearth capabilities, so only Mute/Back/Home/Menu are
   real here — not padded out to match the reference's count.
4. **Power's existing top-right placement is unchanged** — the reference
   image's own header has no power button at all (a gear/settings icon
   only; power is presumably reached through its Scenes feature), so it
   neither confirms nor contradicts the LG ThinQ-sourced placement already
   decided earlier this session. Nothing to correct there.

Not adopted from the reference, deliberately: the top device-chip row
(Apple TV/PS5/Blu-ray/Cable/Music) and bottom Rooms/Scenes/Devices tab
bar — both describe a multi-device home-theater hub spanning several
physical devices at once, which is a different product shape than
Hearth's one-device-per-screen driver model. Adopting the layout
conventions that generalize (control grouping, hierarchy, secondary-
action styling) without importing features Hearth doesn't have.

97/97 tests passing, `tsc --noEmit` clean. Still unverified in Expo Go —
next real checkpoint is Sean looking at this on his actual phone.

## Update 2026-09-10: the merged hub row overflowed the screen

Sean's reaction to a reconstruction of the merged-hub layout above: "that
still is awful looking." Rather than guess again, did the actual
arithmetic on the reconstruction's own exact CSS (mirrored 1:1 from
`hubCard`/`hubRow`'s real style values) instead of eyeballing it:

- Screen width, iPhone SE (the narrowest iPhone this needs to support):
  375pt.
- `content` padding was `theme.spacing.xl` (24) — 48pt off both edges.
- `hubCard` `paddingHorizontal` was `theme.spacing.lg` (16) — 32pt more.
- `hubRow` `gap` was `theme.spacing.xl` (24), twice (rocker↔d-pad,
  d-pad↔rocker) — 48pt.
- Row content itself: rocker (52) + d-pad row (52+12+68+12+52=196) +
  rocker (52) = 300, plus the two 24pt gaps = 348pt needed.
- Available: 375 − 48 − 32 = 295pt.

**348pt needed on 295pt available — 53pt of overflow**, silently clipped
by `hubCard`'s own `overflow: "hidden"` (added for the glow effect). On a
375pt-wide phone, part of the volume or channel rocker was almost
certainly invisible or unreachable. This was a real bug in the shipped
code, not just the reconstruction — the reconstruction just made it
possible to actually measure instead of assume.

**Fixed**, all in `UniversalTvRemote.tsx`'s `styles`:
- `content` padding: `spacing.xl` (24) → `spacing.lg` (16).
- `hubCard` `paddingHorizontal`: `spacing.lg` (16) → `spacing.sm` (8).
- `hubRow` `gap`: `spacing.xl` (24) → `spacing.sm` (8).

New total: 375 − 32 − 16 = 327pt available vs. 316pt needed — fits with
~11pt to spare. Tighter gaps also read more like one cluster, matching
the reference's own tightly-grouped rocker/d-pad arrangement rather than
three separate groups with air between them.

The reconstruction was rebuilt at a true 375px-wide frame (was an
arbitrary 340px, not tied to any real device) and republished at the same
URL with the fix applied and the bug documented on the page itself, so
what Sean sees now is dimensionally accurate to the real constraint, not
just visually similar.

97/97 tests passing (unchanged — no test caught this, since none of this
project's UI has component-level tests; see the standing note on that
convention elsewhere in this ADR), `tsc --noEmit` clean.

## Update 2026-09-10: first real-device pass — four fixes

Sean's first hands-on pass in Expo Go on his actual phone (iPhone 17), in
his own words: "the arrows on the volume and channel controls are cut
off, the snooze[/sleep] and settings are misaligned... the name should be
able to be edited... why the random orange circle... why not have the
menu items on the bottom of the screen?... tv name should be next to the
back button separated by |." Four of these were concrete and immediately
actionable (the rest — a themed on-screen keyboard, streaming-app
shortcuts, and real Settings/Sleep-timer capabilities — are larger builds
tracked separately, not folded into this ADR).

1. **The ambient glow behind the d-pad ("random orange circle")** —
   removed. A flat-color `View` (`theme.accentSoft`) has no blur in React
   Native; what read as atmospheric shading in the HTML reconstruction
   this session used for layout review is a hard-edged circle on a real
   device. Decorative effect that wasn't earning its keep once it
   actually rendered natively; simplest fix is removing it, not fighting
   RN for a fake blur (`expo-blur`/`expo-linear-gradient` would be real
   options if this is revisited, not reached for here).
2. **Utility row (mute/back/home/menu) anchored toward the bottom** —
   `content`'s `contentContainerStyle` gained `flexGrow: 1` so it fills
   the ScrollView's viewport when content is shorter than the screen, and
   a `<View style={{flex:1}} />` spacer before the utility row eats that
   slack space, pushing everything from there down toward the bottom —
   matching the reference image's own bottom-anchored secondary-controls
   row. No effect when content already fills or overflows the screen.
3. **Device name is now editable** — tapping it (a pencil icon signals
   it's tappable) turns it into a `TextInput`; Enter or losing focus
   commits the change through a new `onRename` prop. Previously fixed
   permanently at pairing time with no way to change it after.
4. **Back button merged into the header, next to the name** — was a
   separate row rendered above this whole screen, in `App.tsx`
   (`styles.backRow`, now deleted). Moved into `UniversalTvRemote`'s own
   `headerRow` as a chevron + "|" divider before the name, per Sean's
   literal ask. `App.tsx` now passes `onBack` instead of rendering its
   own back button; the screen's `content` padding gained an explicit
   `paddingTop: 56` to preserve the top safe-area clearance that
   `backRow` used to provide.

102/102 tests passing (none of these four are covered by a test — same
established convention noted above; the count moved because of the
same-session client-key work in ADR-HEARTH-021, not these), `tsc --noEmit`
clean. Not yet re-verified in Expo Go — next checkpoint is Sean looking at
this specific set of fixes on the same iPhone 17 that reported them.

## Update 2026-09-10: one-page layout + d-pad/rocker misalignment

Sean, later the same day, in his own words: "make it one page, no
scrolling on the initial page, like a true remote. then adjust the card
with the arrows and fix it, it looks awful and push immediately." The
"card with the arrows" is the hub card (d-pad + volume/channel rockers).

The rocker misalignment was traced to an actual computable mismatch, not
guessed: the d-pad cluster (up-chevron row + middle row containing
left-chevron / large Select button / right-chevron + down-chevron row)
is `52 + 12 + 68 + 12 + 52 = 196px` tall (`theme.circleDiameter.sm * 2 +
theme.circleDiameter.lg + theme.spacing.md * 2`), while the volume and
channel rocker columns beside it were only laid out with
`gap: theme.spacing.sm` between three fixed-size buttons — around
136px tall. `hubRow`'s `alignItems: "center"` then centered the shorter
rockers against the taller d-pad, leaving roughly a 30px top/bottom
offset between the d-pad's own up/down buttons and the rockers' up/down
buttons — this is what read as "looks awful."

1. **Rocker/d-pad alignment fix** — added a module-level
   `DPAD_HEIGHT` constant computing the d-pad's real height from the
   same theme tokens the d-pad itself is built from, and changed
   `rockerColumn` from `{ alignItems: "center", gap: theme.spacing.sm }`
   to `{ alignItems: "center", justifyContent: "space-between", height:
   DPAD_HEIGHT }` — the rocker's own up/down buttons now land at the
   same vertical positions as the d-pad's, instead of drifting based on
   whichever height a `gap`-based column happens to produce.
2. **One-page compaction** — `hubCard`'s `paddingVertical` reduced from
   `theme.spacing.xxl` (32px) to `theme.spacing.sm` (8px) — it was
   already asymmetric against the `paddingHorizontal: theme.spacing.sm`
   set in an earlier overflow fix, so this also makes the card's padding
   symmetric on top of reclaiming vertical space. `content`'s `gap`
   reduced from `theme.spacing.md` to `theme.spacing.sm` between cards.
   This is a best-effort compaction toward "no scrolling on the initial
   page," not a guaranteed fit — screen height varies by device and this
   hasn't been checked against a real render yet.

115/115 tests passing (style-only changes, no new coverage — same
established convention), `tsc --noEmit` clean. Not yet re-verified on
Sean's device — next checkpoint is Sean confirming both (a) the rockers
now line up with the d-pad and (b) the Remote tab fits without scrolling.
