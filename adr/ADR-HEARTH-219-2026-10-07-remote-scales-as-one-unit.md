# ADR-HEARTH-219: the whole remote screen scales as one unit, in both directions

## Status

Accepted

## Context

Sean, directly: "everything should be able to scale based on the device think iphone pro vs. pro
max." ADR-HEARTH-217/218 made only part of the remote respond to the fit scale -- the d-pad/rocker
hub and some card paddings. Everything else was a fixed size at every device size: the streaming
tiles (an `aspectRatio` box, so very tall on a narrow phone), input-pill heights, the full-width
Command Center button, the header row, status pills, the Remote/Keypad/Keyboard tab bar, and all
text. Measured on `feat/remote-scales-up` before this change:

- **375x667 (iPhone SE) failed for LG: 20px of overflow even at the fit floor**, with a tiny hub
  beside huge tiles, a Command Center button cut off, and the Vol/Ch caption wider than its own pill.
- On the big phones the same fixed pieces stayed small while the hub grew -- lopsided the other way.

## Decision

**One total scale**, `totalScale = widthScale (useResponsiveScale) x fitScale (useRemoteFitScale)`,
computed in `UniversalTvRemote.tsx` and provided to every control under the ScrollView through
`RemoteScaleContext.tsx` (`RemoteScaleProvider` / `useRemoteScaled()` returning `{ scale, size, font }`).
The math is pure and unit-tested in `remoteScale.ts`.

- `size(base)` multiplies layout sizes (padding, gap, radius, icon, tile height, circle diameter) by
  the total scale, unclamped.
- `font(base)` multiplies text by the total scale **clamped to 0.85-1.25** (`FONT_SCALE_MIN/MAX`) so
  nothing becomes illegibly small or cartoonishly large.
- Outside the remote screen the context is 1, so `CapabilityButton` pills and every other screen
  render exactly as before (CapabilityButton's pill padding/min-width/radius/text/icon read the
  context; circles keep following their explicit `scale` prop).
- Applied to: header (back chevron, title, meta line, power button), status pills, tab bar,
  d-pad hub (card padding, row gap, rocker label), streaming tiles (explicit scaled `height`
  replaces `aspectRatio`; wordmark text), input pills, the utility row (circles, captions, rowGap)
  and the Command Center button, keypad/keyboard cards, reconnect card and error banner.
- `fitScale.ts`/`useRemoteFitScale.ts`: the combined scale is also capped by what the window's *width*
  can show without clipping the hub (`maxScaleForWidth`, `REMOTE_BASE_WIDTH_PX` = 356 = 316px hub row
  + 2x8 hub padding + 2x12 screen padding), via a new `maxCombinedScale` argument and `maxFitScaleFor`.
- On a window wider than a phone (tablet) the column is centered and capped at
  `remoteMaxContentWidth(scale)` (never narrower than the scale-1 design width, so a remote shrunk for
  a short phone still uses the phone's full width -- narrowing it only truncated tile text).
- **Rocker caption:** its font follows the hub scale (clamped), it is dropped below
  `ROCKER_LABEL_MIN_SCALE` (0.5; the up/down chevrons already identify the pill), and
  `maxFontSizeMultiplier` caps how far the OS font setting may grow it (the pill is a fixed width and
  the caption is decorative -- each button has its own accessibility label).

### Reversal of the "fonts never scale" rule

ADR-HEARTH-040 / the original `useResponsiveScale.ts` deliberately scaled neither fonts nor spacing.
Sean's "everything should scale" **overrides** that for the remote screen. The OS font-size setting
(`allowFontScaling`) is not touched: it still multiplies on top of the size this produces, and only
the decorative rocker caption has a cap. `useResponsiveScale.ts`'s doc comment now says so.

### Kept exactly as before

D-pad arrows tangent to the disc rim (ADR-HEARTH-037) and rockers aligned with the d-pad's
up/down arrows (ADR-HEARTH-218): every internal gap and padding of the hub is now a multiple of the
same `scale`, so the proportions are identical at any size. Hub geometry constants are unchanged.

## Verification

`scripts/ui-verify` (`UI_VERIFY_VIEWPORT=WxH`, every size below; `client` is the ScrollView height),
`assertFit` scenarios, overflow in px (spare in px), before -> after:

| Size | remote-lg | remote-lg-seek-tap-streak | remote-lg-keypad | remote-lg-keyboard | remote-samsung |
|---|---|---|---|---|---|
| 375x667 | FAIL 20 -> PASS 0 (15) | FAIL 20 -> PASS 0 (15) | PASS (40) -> PASS (29) | PASS (53) -> PASS (32) | PASS (15) -> PASS (15) |
| 390x844 | PASS (15) -> PASS (16) | PASS (15) -> PASS (16) | PASS (199) -> PASS (186) | PASS (228) -> PASS (189) | PASS (36) -> PASS (26) |
| 393x852 | PASS (15) -> PASS (15) | PASS (15) -> PASS (15) | PASS (205) -> PASS (190) | PASS (236) -> PASS (194) | PASS (26) -> PASS (27) |
| 430x932 | PASS (15) -> PASS (16) | PASS (15) -> PASS (16) | PASS (259) -> PASS (221) | PASS (311) -> PASS (223) | PASS (25) -> PASS (17) |
| 440x956 | PASS (15) -> PASS (15) | PASS (15) -> PASS (15) | PASS (278) -> PASS (233) | PASS (335) -> PASS (237) | PASS (27) -> PASS (19) |
| 820x1180 | PASS (33) -> PASS (18) | PASS (33) -> PASS (16) | PASS (465) -> PASS (304) | PASS (595) -> PASS (397) | PASS (164) -> PASS (36) |
| 667x375 landscape | FAIL 423 -> FAIL 334 | FAIL 423 -> FAIL 334 | FAIL 304 -> FAIL 104 | FAIL 174 -> FAIL 95 | FAIL 274 -> FAIL 232 |

Every `assertFit` scenario passes at every portrait size. **Landscape on a phone (667x375) cannot
fit**: the ScrollView there is 292px tall, and the header, status row, tab bar and the two utility-row
caption lines alone approach that at the minimum text size; shrinking boxes further would put tap
targets under ~26px. It is smaller than before (and still scrolls, since the screen is a ScrollView),
but is not fixed -- stated plainly rather than hidden.

Screenshots at every size were read for LG and Samsung: nothing clipped or overlapping; the Vol/Ch
caption sits inside its pill; on 430/440/820 the remote visibly grows into the extra height (Samsung
spare 17-19px at 430/440, down from 25-27); on a tablet the column is centered at a proportionate width.
`remote-lg-fontscale-130/160` (INFO-only) at 375x667 improved from 63px / 147px of overflow with a cut-off
Command Center button to 0px / 3px; at 160% the boxes shrink while the OS-enlarged text does not, so the
tile wordmarks truncate ("NETF...") as they already did before -- not worse than before.

`npx tsc --noEmit` clean; `npx jest --testPathIgnorePatterns="/node_modules/"`: 2433 passed, 18 skipped,
1 pre-existing unrelated failure (`runner/shims/shims.test.ts`, `ws` `WebSocketServer`, same as ADR-HEARTH-217).
New tests: `remoteScale.test.ts` (size/font clamping, width cap, column max width, rocker caption rule)
and `maxFitScaleFor` cases in `fitScale.test.ts`.

## Consequences

- One mechanism (`useRemoteScaled`) instead of per-file math; new remote controls get scaling by
  reading the context.
- `fitScale` props were removed from `StreamingAppsRow`, `InputSelectionCard`, `UtilityActionsRow`,
  `UtilityAction`, `DpadCluster`, `VolumeChannelCard` -- they read the context / the combined `scale`.
- The fit is still keyed per device+tab (ADR-HEARTH-217), so the header/tab bar can change size when
  switching to a shorter tab (Keypad) that needs less shrinking. Left as is; making chrome and content
  scale independently would be a separate decision.
- On a window wide enough that the hub's width, not the height, is the limit (e.g. a Pro Max Keypad
  tab), spare height stays at the bottom: scale cannot grow past what the width can show.
- Not checked on a physical device; the harness measures web layout with a fallback sans-serif font.
