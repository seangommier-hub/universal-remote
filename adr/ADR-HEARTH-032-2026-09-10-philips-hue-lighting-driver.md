# ADR-HEARTH-032: Philips Hue lighting driver — Phase 5's first integration

Date: 2026-09-10

## Status

Accepted.

## Context

Phase 5 of the roadmap ("Smart lighting") calls for a `HueDriver`, new `lighting`
capabilities, and eventually a cross-category `Room` screen proof. With Sean's
iOS-sideload investigation concluded (ADR-HEARTH-031, blocked on Apple Developer
Program approval) and the real-hardware TV checkpoints needing Sean at his
actual devices, this is genuine forward progress that doesn't require either:
the Hue driver + client can be built and fully unit-tested (mocked HTTP,
matching every other driver in this codebase) without a real bridge.

`docs/DEVICE_FEASIBILITY.md` already researched this space in depth and named
Philips Hue the "top pick for first lighting/smart-home platform integration":
fully official local REST API, physical-button pairing, and — notably — one of
the very few smart-home ecosystems that works completely in Expo Go with zero
native modules, for both control and (cloud-assisted) discovery.

## Decision

**New capabilities** (`src/core/types/Capability.ts`): reused the existing
`power` id (already a toggle, not a separate on/off pair — matches
SimulatedTvDriver/SonyBraviaDriver/SamsungTizenDriver's usage) for the light's
on/off state, and added `setBrightness`/`setColor`. Both take **normalized
universal units** — brightness and saturation as 0-100 percentages, hue as
0-360 degrees (CSS-style HSL) — not Hue's native 1-254/0-65535/0-254 scales.
This mirrors how `setVolume`/`setChannel` already take plain numbers rather
than a protocol-specific encoding, so a future second lighting brand (e.g. a
driver behind a different color-space convention) isn't locked to Hue's units.

**`HueBridgeClient`** (`src/drivers/lighting/hue/HueBridgeClient.ts`): thin
wrapper around the bridge's local v1 REST API
(https://developers.meethue.com/develop/hue-api/), reusing
`requestWithRelayFallback` (the same FCC-relay-on-network-isolation fallback
every other driver's HTTP client uses — ADR-HEARTH-011) rather than raw
`fetch`. Three methods:
- `pair(appName)` — one-time pairing (`POST /api` with `{devicetype}`) while
  the user physically presses the bridge's link button. Hue's own "link
  button not pressed" failure (error type 101) is a normal, expected,
  retryable state during pairing, not a fatal error — surfaced as its own
  `HuePairingPendingError` type so a future pairing UI can poll on it, the
  same way `RokuValidationError`/similar distinguish "bad input" from "device
  unreachable" elsewhere in this codebase.
- `getLightState`/`setLightState` — read/write one light's state, converting
  to/from Hue's native scales at the boundary (the driver and everything
  above it only ever sees universal units).

**`HueLightDriver`** (`src/drivers/lighting/hue/HueLightDriver.ts`): each Hue
*light* — not the bridge itself — is modeled as its own `Device`, consistent
with how every other integration in this codebase is one physical device per
`Device` record. Multiple lights on the same bridge share the same `username`
(the bridge-issued API key from pairing) but each carries its own `lightId` in
`device.config`. No reconnect-backoff machinery like the TV drivers
(ADR-HEARTH-017): Hue's API is stateless per-request HTTP with no persistent
connection to lose, so there's nothing to schedule a retry against — a failed
command simply marks the device disconnected and the next command tries
again on its own.

Registered in `src/runtime/bootstrap.ts` alongside the four TV/streaming
drivers, even though no pairing UI screen exists yet for it (out of scope for
this pass — see Consequences). The driver is fully testable and usable via
`CommandEngine.execute()` today; only the "+ Add Hue Light" onboarding screen
(mirroring `AddSonyDeviceScreen.tsx` etc.) is still needed before a real user
can pair one through the app.

## Consequences

- 139/139 tests passing (115 before this ADR + 24 new: 11 for
  `HueBridgeClient`, 13 for `HueLightDriver`), `tsc --noEmit` clean. None of
  this has been run against a real Hue bridge — same disclaimer as every
  other driver in this codebase before its real-hardware checkpoint.
- No pairing/discovery UI yet. The feasibility doc's cloud-assisted N-UPnP
  discovery endpoint (`discovery.meethue.com`) for finding the bridge's local
  IP without a native mDNS module is a real, Expo-Go-compatible path, but
  wiring an actual `AddHueDeviceScreen` (bridge IP entry or N-UPnP discovery,
  link-button-press polling loop using `HuePairingPendingError`, then a
  light-picker to create one `Device` per light) is separate follow-up work,
  not attempted here.
- `setColor`'s hue/saturation model doesn't cover Hue's alternative `xy`/`ct`
  (color temperature) color modes — sufficient for the MVP capability set the
  roadmap calls for ("on/off/brightness/color"), but a "warm white ↔ cool
  white" slider would need a `setColorTemperature` capability added later,
  the same incremental way every other capability in this codebase was added
  only once a driver actually needed it.

## Update 2026-09-10 (same day, later): pairing UI + light control screen added

Closed the two gaps flagged above as follow-up work.

**`AddHueDeviceScreen.tsx`** — a genuinely two-step flow, unlike the other
four Add screens' single form: (1) enter the bridge's IP and tap Pair, which
polls `HueBridgeClient.pair()` — a `HuePairingPendingError` (link button not
yet pressed) is treated as a normal "waiting" state, not an error, matching
how the client itself was designed to make this distinction; (2) once paired,
`listLights()` (new `HueBridgeClient` method, 2 new tests) populates a
picker so the user chooses which light this `Device` represents. Wired into
`App.tsx`'s existing `AddableBrand` union/screen-switch, and
`DeviceListScreen.tsx`'s "+ Add" menu, the same way Sony/Samsung/LG/Roku are.

**`LightControlScreen.tsx`** — deliberately a new, separate screen rather
than reusing `UniversalTvRemote`: a light's capability set (power/
setBrightness/setColor) shares no real controls with a TV remote's, so
routing a lighting-category device through that screen would mean hiding
almost everything in it, not fitting the device. `App.tsx`'s "remote" screen
now branches on `device.category === "lighting"` to pick between the two.
Reuses the same state-subscription/reconnect-on-mount/rename patterns as
`UniversalTvRemote` (same `stateStore`/`commandEngine` plumbing) so the two
screens behave consistently even though their controls don't overlap.
Brightness is a +/-10% stepper and color is a fixed 9-swatch palette rather
than a slider or full color picker — matches this app's existing
discrete-press interaction model and needs no new dependency (no slider
library is installed in this project).

141/141 tests passing (139 + 2 for `listLights`), `tsc --noEmit` clean. Not
yet run against a real bridge/light — same disclaimer as before; this is the
one remaining checkpoint before Phase 5's driver work is actually verified,
tracked in ROADMAP.md.

## Update 2026-09-10 (same day, later): MAC re-discovery parity with the TV drivers

Sean: "keep marching." Checked whether Hue had the same "saved IP goes
stale after a network change" gap just fixed on LG/Samsung
(ADR-HEARTH-017) — it did, for the same underlying reason: a Hue bridge
can move to a different WiFi network just as easily as a TV can. Applied
the same fix: `HueLightDriver.connect()` now attempts a MAC-based
re-discovery (`findCurrentIpByMac`) on any connect failure if the device
has a `hwaddr` on file, retrying once at whatever current address it
finds — since Hue's HTTP client has no equivalent of LG/Samsung's
distinct "pairing timeout vs. unreachable" error, re-discovery is
attempted on *any* failure here; if the bridge isn't actually at a new
address, the lookup just finds nothing and the original error surfaces
unchanged, so this is harmless to try broadly.

`AddHueDeviceScreen.tsx` now backfills `hwaddr` right at pairing time
(via `findMacByIp`, a reverse lookup at the bridge's just-confirmed IP) —
unlike the TV drivers, where only discovery-added devices get one, every
Hue light gets this automatically at first pairing, since pairing always
goes through this one screen (there's no separate "manual add" path for
Hue the way Add Sony/Samsung/LG/Roku TV exist as an alternative to
Discover).

180/180 tests passing (2 new), `tsc --noEmit` clean.
