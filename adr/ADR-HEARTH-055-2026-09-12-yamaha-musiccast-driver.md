# ADR-HEARTH-055: Add Yamaha MusicCast AV receiver/soundbar driver

Date: 2026-09-12

## Status

Accepted.

## Context

ADR-HEARTH-054 ranked Yamaha MusicCast as the single best next integration: a fully local,
zero-auth, plain HTTP/JSON API (`http://<ip>/YamahaExtendedControl/v1/...`), Expo-Go-compatible,
and near-identical in shape to the already-shipped Sony BRAVIA driver. Sean confirmed to proceed
("just keep going") after reviewing the roadmap.

Per [[hearth_new_integrations_include_fcc]] (memory, Sean explicit 2026-09-12: "remember to always
do the integrations to the command center too") — checked explicitly for this driver: **no Family
Command Center-side change was needed.** `requestWithRelayFallback` (`src/core/network/
httpRelayFallback.ts`) already relays *any* plain HTTP target through FCC's existing, generic
`/api/integrations/hearth/relay/http` route (targetIp/targetPort/path/method/headers/body — nothing
Yamaha-specific) whenever a direct connection fails. This driver only had to call that existing
function the same way SonyBraviaClient/RokuEcpClient already do; nothing server-side to add.

## Decision

Added `src/drivers/tv/yamaha/YamahaMusicCastClient.ts` (thin GET-based client, one call per
`main`-zone endpoint: `getStatus`, `getAvailableInputs` via `system/getFeatures`, `setPower`,
`setVolume`, `setMute`, `setInput`) and `YamahaMusicCastDriver.ts` (implements `DeviceDriver`,
capabilities: `power`, `volumeUp`, `volumeDown`, `setVolume`, `mute`, `inputSelection` — the same
set Sony's driver declares, since MusicCast's API has no directional-nav/select/home/menu surface
either, being an AV receiver rather than a TV with an on-screen UI).

Wired identically to every other manual-add driver: `AddYamahaDeviceScreen.tsx` (IP-only form, no
PSK/key field since the API has no auth at all), a new `"yamaha"` `AddableBrand` + tile in
`DeviceListScreen.tsx`, a render branch in `App.tsx`, driver registration in `bootstrap.ts`, and a
`BRAND_MATCHERS` entry in `FamillyCommandCenterDiscoveryProvider.ts` (`/yamaha/i` on
name/vendor) so a MusicCast receiver surfaces automatically via Discover Devices, not just manual
add.

Applied [[ADR-HEARTH-052]]'s fix proactively rather than reintroducing the bug in new code: the
Add-device screen's failed-connect catch calls `driver.disconnect(device)` immediately, the same
pattern every other Add screen now uses.

## Consequences

- Zone scope: only the `main` zone is modeled (matches every other driver's one-primary-device-state
  shape). A MusicCast unit's zone2/3/4 outputs are not controllable — real future feature, not part
  of this pass.
- No input-list fallback UI copy exists yet for a device that returns zero inputs from
  `system/getFeatures` — same best-effort "leave the UI without an input list" behavior as Sony's
  driver in that case, not a new gap.
- **Not live-hardware-tested** — no MusicCast device was found on Sean's home network during
  tonight's discovery scans (only the LG TV, 3 Ring devices, and an Amazon Smart Plug were present).
  Type-checked and structurally mirrors two already-shipped, live-verified drivers (Sony, Roku), but
  the actual Extended Control API response shapes are taken from the community-hosted spec cited in
  ADR-HEARTH-054, not confirmed against a real unit. Needs a genuine MusicCast device to verify
  before treating this as done the way LG's driver now is.
- **Update, same night**: added `YamahaMusicCastDriver.test.ts` (13 tests, mirroring
  `SonyBraviaDriver.test.ts`'s own mocking style — `global.fetch` mocked directly rather than the
  client) — capability declaration, connect()'s real status+input-list read, an empty-input-list
  device not failing connect(), power/volumeUp/volumeDown/mute all toggling off the device's own
  real current state rather than an assumed one, volume clamping at 0 and at the device's own
  reported `max_volume`, inputSelection passing a real id straight through, a non-zero
  `response_code` raising a real error, a missing-config device rejecting, and both `setVolume` and
  `inputSelection` rejecting before any network call when their required arg is missing. This is
  the strongest verification available without real hardware — closes the gap this ADR flagged, but
  does not replace the still-outstanding live-hardware check above.

## Related

[[ADR-HEARTH-054]], [[ADR-HEARTH-052]], SonyBraviaDriver.ts/SonyBraviaClient.ts (the pattern this
mirrors), [[hearth_new_integrations_include_fcc]]
