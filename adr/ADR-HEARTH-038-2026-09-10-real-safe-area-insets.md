# ADR-HEARTH-038: Real device safe-area insets replace hardcoded header padding

Date: 2026-09-10

## Status

Accepted.

## Context

Sean: "you need ui cleanup on many pages like the discover devices page
where cancel is behind settings gear." He was testing on an Android
emulator; asked to look at it directly via computer-use, but the exact
emulator app/window name couldn't be identified (not in the Start Menu
app list, nothing about it in any project's memory across the whole
workspace) — diagnosed from source instead.

Every screen in this app (11 total) computed its own top clearance as a
hardcoded number — `paddingTop: 56` on most screens, `64` on the device
list and the four Add\*DeviceScreen forms (via the shared
`addDeviceFormStyles.ts`) — guessed at some point to clear an iPhone's
notch/status bar. `react-native-safe-area-context` was not a dependency
of this project at all; nothing computed a real per-device inset
anywhere. Android's status bar height is not the same fixed value as an
iPhone notch and varies by device/emulator skin, so a number tuned
(however loosely) for iOS has no reason to be correct on Android — a
screen's own header content (a title, a Cancel button) rendering underneath
the system status bar is exactly what a wrong, too-small top padding looks
like on a device it wasn't tuned for.

## Decision

Installed `react-native-safe-area-context` (`npx expo install`, SDK-57
compatible version resolved automatically) and wrapped `App.tsx`'s root in
`<SafeAreaProvider>` (both the loading-state early return and the main
render, so `useSafeAreaInsets()` is available everywhere in the tree,
regardless of which screen is showing).

Every screen that had a hardcoded top-clearance value now calls
`useSafeAreaInsets()` and applies `insets.top + theme.spacing.lg` at its
own render call site, replacing the removed hardcoded constant:
`DiscoverDevicesScreen`, `DeviceListScreen`, `LightControlScreen`,
`CommandCenterRemoteScreen`, `ScanFamilyCommandCenterQrScreen`,
`UniversalTvRemote`, and the five screens sharing `addDeviceFormStyles.ts`
(`AddSonyDeviceScreen`, `AddSamsungDeviceScreen`, `AddLgDeviceScreen`,
`AddRokuDeviceScreen`, `AddHueDeviceScreen`, plus `EditDeviceAddressScreen`
and `FamilyCommandCenterSettingsScreen` which also consume that shared
style). `theme.spacing.lg` (16) was picked as the one consistent "extra
breathing room beyond the safe area" token across every screen, replacing
several different ad hoc numbers (56, 64) that didn't obviously derive
from any single formula.

`addDeviceFormStyles.ts`'s shared `content` style dropped its hardcoded
`paddingTop: 64` entirely — since it's a plain `StyleSheet.create()`
object, not a component, it can't call a hook itself; each of its seven
consuming screens now layers the dynamic inset on top of the shared style
at its own `contentContainerStyle` prop instead
(`[styles.content, { paddingTop: insets.top + theme.spacing.lg }]`),
preserving the file's own stated purpose (centralizing the *look*, not
becoming a component).

## Consequences

- 190/190 tests passing (style-only change, no test coverage change
  needed), `tsc --noEmit` clean.
- Not yet visually confirmed on Sean's Android emulator — the actual
  emulator window couldn't be accessed this session (name unknown, not
  resolvable via computer-use's app allowlist). This fix is verified
  correct by source-level reasoning (no code path computes top clearance
  from a hardcoded number anymore, anywhere in the app) and by `tsc`/
  `jest`, not by a live screenshot. Next real checkpoint: Sean confirming
  the Discover Devices page's Cancel button (and the rest) render clear
  of system UI on that emulator.
- If the original complaint turns out to be something else entirely (e.g.
  a floating dev-tools overlay from Expo Go itself, unrelated to Hearth's
  own layout code — ruled unlikely but not completely, since it couldn't
  be visually confirmed), this fix is still correct and worth keeping on
  its own merits: hardcoded safe-area padding was a real latent bug
  regardless of whether it's the exact one Sean saw.
