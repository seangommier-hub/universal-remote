# ADR-HEARTH-104: Squirrel feeder driver + first real tab navigation

Date: 2026-09-20

## Context

Sean's ESP32-based squirrel feeder (separate project:
`AI Engineering Workspace/projects/squirrel-feeder`) now has a working
local HTTP API — `GET /status` and `POST /dispense` — confirmed working
over the real network (see that project's `adr/0006`-`0008`). He wants it
surfaced in Hearth.

Hearth has never had a navigation library. Every screen today is toggled
by local state in `App.tsx` (device list -> remote screen -> add-device
flow), which the README explicitly frames as deliberate ("no navigation
library yet -- added once justified").

## Question

Should the feeder be added as just another device in the existing
`DeviceListScreen` (the pattern every other driver in this codebase
follows), or as a dedicated top-level tab, which means introducing
Hearth's first real navigation library?

## Answer

A dedicated tab, using React Navigation's bottom tabs (`@react-navigation/
native` + `@react-navigation/bottom-tabs`), confirmed directly with Sean.
Two tabs: **Devices** (wraps the existing device-list/remote/add-device
flow essentially unchanged) and **Feeder** (new).

## Rationale

- This is exactly the kind of "added once justified" moment the README
  anticipated -- a device that doesn't fit the remote-control device-list
  metaphor at all (no directional nav, no volume, just a status view and
  one action) is a legitimate reason to introduce real navigation rather
  than stretching the existing pattern further.
- React Navigation is the standard, Expo-documented choice (not a
  speculative pick) -- large community, actively maintained, first-party
  Expo support.
- Wrapping the existing flow inside a "Devices" tab rather than rewriting
  it preserves everything already built and tested; the new tab is
  additive, not a rewrite.

## Consequences

- `react-native-screens` and `react-native-gesture-handler` are new peer
  dependencies (`react-native-safe-area-context` was already present).
  Installed via `npx expo install` for SDK-57-compatible versions, not
  raw `npm install`.
- `App.tsx`'s root now renders a `NavigationContainer` + bottom
  `Tab.Navigator` instead of switching screens directly; the existing
  device-list/remote/add-device state-toggle logic moves into a
  `DevicesTabScreen` component, otherwise unchanged.
- Future device categories that also don't fit the remote-control metaphor
  now have a precedent and a place to go (an additional tab), rather than
  each needing its own one-off justification.
- The feeder driver follows the Hue pattern, not the Roku/TV pattern: per
  research into the existing codebase, Hue's driver has **no
  reconnect-backoff machinery** because its API is stateless per-request
  HTTP with no persistent connection to lose -- the same is true for the
  feeder's API. `HTTP 429` from `/dispense` is treated as a normal "feeder
  busy" business outcome (parallel to Hue's pairing-pending error), not a
  connection failure.
- No driver in this codebase currently polls in the background for live
  state -- the feeder tab follows that same convention (refresh on screen
  focus / pull-to-refresh, not a persistent poll loop) unless Sean asks
  for live-ticking stats later.

## Implementation (2026-09-20)

Built as designed above, plus a few decisions made while implementing
that follow directly from this ADR's own stated design rather than
needing a fresh ask-first round:

- `feeder` added to `DeviceCategory` (`Device.ts`) and `dispense` added
  to `CapabilityId` (`Capability.ts`) -- the feeder needed both, and
  neither existed yet.
- `SquirrelFeederClient.ts` / `SquirrelFeederDriver.ts`
  (`src/drivers/feeder/squirrelFeeder/`) mirror `HueBridgeClient`/
  `HueLightDriver` exactly: no reconnect backoff, `connect()` just reads
  `/status` once. `POST /dispense`'s HTTP 429 surfaces as a
  `SquirrelFeederBusyError` the driver turns into a normal
  `CommandResult.success: false` (not a thrown error, not a
  disconnect) -- connection state is left untouched.
- The feeder's add-device flow (`AddSquirrelFeederDeviceScreen.tsx`) is
  self-contained inside the Feeder tab, not part of `DeviceListScreen`'s
  `AddableBrand` union/picker -- it's the tab's own empty state (no "+
  Add" modal detour needed), consistent with this ADR's framing that the
  feeder doesn't belong in that list at all.
- The Devices tab's device list explicitly filters out `category ===
  "feeder"` (`App.tsx`) -- without this a feeder device would render
  twice (once, broken, via `UniversalTvRemote`, which has nothing
  meaningful to show it) and once correctly in its own tab.
- `App.tsx`'s per-device handlers (`handleDeviceAdded`,
  `handleRenameDevice`, `handleAddressUpdated`, etc.) no longer touch
  screen-navigation state directly -- they do registry/persistence work
  and hand back the affected device; `DevicesTabScreen.tsx` (which now
  owns the `screen` union) decides what to navigate to. This is what let
  `FeederTabScreen.tsx` reuse the exact same `handleDeviceAdded`/
  `handleReconnect`/`handleRemoveDevice` functions without either tab
  needing to know about the other's navigation.
- Verified via `npm run typecheck` (clean) and the full Jest suite (89
  suites / 908 tests, all passing) -- no real device/Expo Go run yet;
  that's still Sean's own next step since no iOS/Android simulator
  exists in this environment.
