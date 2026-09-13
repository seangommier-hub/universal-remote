# ADR-HEARTH-049: ADR-HEARTH-046 only fixed 2 of 4 identical headers, plus a real tile-label overflow it never looked at

Date: 2026-09-12

## Status

Accepted.

## Context

Sean, testing live on his own iPhone via Expo Go, confirmed after ADR-HEARTH-046 landed that
"the spacing/overlap problem is STILL there." That ADR's fix (`minWidth: 0` + `numberOfLines={1}`
on `DeviceListScreen.tsx` and `UniversalTvRemote.tsx`'s headers) was spec-correct for what it
touched, but incomplete: the codebase has **four** screens with the identical
back-chevron/divider/`flex: 1` name-and-meta/fixed-button header shape, and ADR-HEARTH-046 only
found two of them.

`CommandCenterRemoteScreen.tsx`'s `headerText` (`title`/`subtitle` next to a `keypad-outline`
toggle button) and `LightControlScreen.tsx`'s `headerText` (device name/manufacturer next to a
Power button) both had `flex: 1` with **no `minWidth: 0`** and **no `numberOfLines`** on their
Text children — the exact same Yoga min-content-floor bug ADR-HEARTH-046 diagnosed and fixed
elsewhere, just never checked here. `CommandCenterRemoteScreen`'s subtitle is a live VNC server
name (`serverInfo.name`) — a real, unbreakable hostname string is a substantially more likely
overflow trigger than a fixed two-word app title. `LightControlScreen`'s device name has the same
40-character rename risk as `UniversalTvRemote`'s already-fixed one. Given ADR-HEARTH-046 was
diagnosed by static arithmetic rather than live device confirmation (its own stated caveat), and
Sean is opening a Command Center or light screen at least as plausibly as the two screens that
got fixed, this is a strong candidate for what he's still seeing.

Separately, this session verified Sean's own concrete example — the "Sync from SmartThings" tile
on `DeviceListScreen.tsx`'s `ADD_DEVICE_OPTIONS` grid — by exact-dimension arithmetic, this
codebase's own established verification method (see `UniversalTvRemote.tsx`'s "348px... 53px too
wide" comment). At a 375pt baseline: `container`'s `paddingHorizontal: xl` (24 each side) leaves
327px; `addGrid`'s two-column tiles (`flexBasis: "47%"`, `flexGrow: 1`, one `spacing.sm` (8) gap
between them) each resolve to ~159.5px; each tile's own `paddingHorizontal: md` (12 each side)
leaves ~135.5px; minus the 20px icon and `spacing.sm` (8) gap, the label gets ~107.5px. "Sync from
SmartThings" (21 characters, ~168px unwrapped at `type.body`/600-weight) is the one label in that
list long enough to exceed that — every sibling ("Sony TV" through "Philips Hue") already fits.
`addTileLabel` had no `flex`/`flexShrink` at all, and React Native's default `flexShrink: 0` for a
non-flex row child (unlike web CSS's default of 1) means it keeps its full single-line intrinsic
width rather than wrapping to fit, instead of clipping cleanly — the same "needs an explicit
flex/shrink or it won't behave" pattern this file already handles correctly for `cardBody`,
`reconnectTextGroup`, and `commandErrorText`, just missed for this one label. Being the last
(rightmost) tile in the grid, the unwrapped overflow runs toward the screen's right edge.

A full audit of every screen in `src/ui/` (per the task's own request, not just the two examples)
also found three raw hardcoded spacing numbers that drifted in after ADR-HEARTH-026's spacing
audit, in files created same-day or after it: `addDeviceFormStyles.ts`'s `headerRow.marginBottom:
4`, `LightControlScreen.tsx`'s `deviceMeta.marginTop: 2`, and `CommandCenterRemoteScreen.tsx`'s
`subtitle.marginTop: 2` — all snapped to `theme.spacing.xs` (4), matching ADR-026's own rounding
convention for near-miss values. A full `grep` for `(padding|margin|gap)[A-Za-z]*: [0-9]+` across
`src/ui/` now returns only the two pre-existing, intentional `padding: 0` resets (`CapabilityButton`'s
circle button, `LightControlScreen`'s inline name-edit input) — confirmed clean, not assumed.

Every other screen (`DiscoverDevicesScreen`, all six `Add*DeviceScreen` files,
`FamilyCommandCenterSettingsScreen`, `ScanFamilyCommandCenterQrScreen`,
`EditDeviceAddressScreen`) was checked for the same header/tile-overflow shape and does not have
it — their titles are either fixed short strings, or (in `EditDeviceAddressScreen`'s case, whose
title embeds `device.name`) sit in a header row with no sibling after the title, so an unusually
long value degrades to wrapping/extra height rather than overlapping another control. Left as-is
per this task's "smallest correct changes" instruction — no verified overlap there.

## Decision

1. `CommandCenterRemoteScreen.tsx` and `LightControlScreen.tsx`: added `minWidth: 0` to
   `headerText` and `numberOfLines={1}` to the title/name and subtitle/meta `Text` elements —
   identical fix, identical comment convention, to ADR-HEARTH-046.
2. `DeviceListScreen.tsx`: `addTileLabel` gains `flex: 1, minWidth: 0` and its `<Text>` gains
   `numberOfLines={2}` (not 1 — "Sync from SmartThings" needs two lines to read in full at this
   tile width, and it fits: ~107.5px available, ~13-14 characters per line, "Sync from" /
   "SmartThings" both fit). No `addTile` height changes needed — `addGrid`'s default
   `alignItems: "stretch"` already stretches every tile on the same wrapped line to match the
   tallest one, so a 2-line label doesn't create a mismatched-height row on its own.
3. Three raw spacing literals snapped to `theme.spacing.xs`, per ADR-HEARTH-026's own convention.

## Rationale

Not visually confirmed live — Sean's phone is currently connected to an active Expo Go session
(port 8082 already `LISTENING`/`ESTABLISHED` when this session checked), so a second dev server
wasn't started to avoid disrupting it, and this project has no `react-native-web` dependency, so
no browser-based render was available either. Every fix here is verified by exact-dimension
arithmetic against this codebase's own established baseline (375pt) and its own established
convention for doing this kind of check, same discipline as ADR-HEARTH-046, -040, -016, -024 —
not by eyeballing or guessing. The two header fixes are also verified by direct pattern-match
against ADR-HEARTH-046's own already-reasoned mechanism, applied to the two screens sharing the
identical shape that ADR-HEARTH-046 itself didn't check.

`CapabilityButton`'s `lightButton`/`outletButton` full-width call sites in `AddHueDeviceScreen.tsx`
and `AddSmartThingsOutletsScreen.tsx` render a single, non-flex `<Text>` label with no
`numberOfLines` inside a `width: "100%"` button — the same default-`flexShrink: 0` risk class, for
a user-customized Hue light or SmartThings outlet name. Not fixed here: real light/outlet names
seen in this codebase's own fixtures are well under the ~35+ characters needed to trigger it at
this button's width, so this is a lower-confidence, unverified risk rather than a confirmed
overflow — noted rather than patched, per the task's explicit instruction to prioritize verified
issues over speculative ones.

## Consequences

- `npx tsc --noEmit` clean; all 207 Jest tests pass (no UI/snapshot tests exist in this project,
  so none of these are exercised by the suite — style-only changes to already-untested screens).
- Still not visually confirmed on Sean's real device — same outstanding caveat ADR-HEARTH-046 had,
  now inherited by this ADR too. Next real checkpoint: Sean re-testing the Command Center trackpad
  screen, a light's control screen, and the home screen's "Sync from SmartThings" tile
  specifically, since those are the three concrete spots this pass changed.
- Did not touch `httpRelayFallback.ts`, `SmartThingsClient.ts`, or anything Apple
  signing/SideSign/MacinCloud-related, per this task's explicit scope boundary.

## Related

ADR-HEARTH-016, ADR-HEARTH-024, ADR-HEARTH-026, ADR-HEARTH-040, ADR-HEARTH-046
