# ADR-HEARTH-092: Home screen restructured — Connected Devices, inline Suggested, single Add button

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

Sean, after ADR-HEARTH-089's reordering: "spacing is not great, the discover is underneath, i
think that there should be an add a device button with the list of devices, and then there should
be a 'suggested from your network' section and at the top the 'connected devices' section."

## Decision

Restructured `DeviceListScreen.tsx` top to bottom:

1. **"Connected Devices"** section label above the existing device list (previously unlabeled).
2. **"Suggested From Your Network"** — new, runs `FamilyCommandCenterDiscoveryProvider.scan()`
   silently in the background on mount/whenever the paired device count changes. Renders nothing
   at all if Family Command Center isn't configured (ADR-HEARTH-089's opt-in choice), the scan
   fails, or every found device is already paired — this is a bonus convenience, never an error
   state. Only known-brand results are shown, each with a one-tap "Add" button that connects,
   applies the suggested-name logic from ADR-HEARTH-085, and routes through `handleDeviceAdded` —
   the exact same duplicate-prevention/persistence path every other add flow already uses, so a
   quick-add here behaves identically to adding through the full Discover screen or a manual
   Add*Screen.
3. **A single "Add a Device" button** (solid-filled, now the primary action) replaces the always-
   visible 9-tile grid — tapping it opens a compact picker modal listing the same brands.
   `DiscoverDevicesScreen` remains reachable via a small secondary "Scan your network for more
   (optional)" link, for its fuller feature set (unsupported-device visibility, "add manually as
   a different brand" override) that the compact inline suggestions don't attempt to replicate.

## Implementation note: nested scrolling

With three stacked sections now able to exceed one screen's height, the whole content area needed
to scroll together. The device list's `FlatList` had `scrollEnabled={false}` set and the entire
body wrapped in a `ScrollView` — nesting a scrolling `VirtualizedList` inside a `ScrollView` is a
real, documented React Native bug class (janky/broken scroll interaction), not just a style
preference, so disabling the inner list's own scroll was necessary, not optional.

## Consequences

- `DeviceListScreen` now needs `driverRegistry` (to connect a suggested tile) and a new
  `onQuickAdd` prop (wired to `App.tsx`'s existing `handleDeviceAdded`) — no new logic was
  duplicated for the quick-add path itself.
- The old `discoverTile`/`addGrid`/`addTile` styles were removed (confirmed unreferenced before
  deletion, not just assumed dead).
- No dedicated test coverage was added — this project has no established test convention for
  screen-level UI/`App.tsx` (noted already in ADR-HEARTH-085/086); verified via `tsc --noEmit` and
  the full existing suite staying green (34 suites / 366 tests) instead.
- Ships as a pure JS/UI change via EAS Update — no native additions, no rebuild required.
