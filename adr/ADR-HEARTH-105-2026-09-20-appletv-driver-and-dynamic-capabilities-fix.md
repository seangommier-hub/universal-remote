# ADR-HEARTH-105: Apple TV driver, plus a real bug in dynamic-capability drivers

**Date:** 2026-09-20
**Status:** Accepted, implemented; not yet verified against real hardware

## Context

Continuing the same round of research-driven integrations as ADR-HEARTH-103 (Broadlink). Apple TV
was the parallel research agent's other clean recommendation: pairing is a real, local, PIN-based
HAP handshake shown on the Apple TV's own screen — verified directly against `postlund/pyatv`
(1.5k+ stars, the standard open-source Apple TV client, backs Home Assistant's own integration),
not assumed from the earlier research pass alone. No Apple ID or password is ever involved, and
it's architecturally simpler than PS5: one PIN step, no browser/OAuth redirect at all.

Verified live on the Pi (not just from docs): `pip3 install pyatv` succeeded; `atvremote commands`
was inspected directly to confirm the real, current command surface (`turn_on`/`turn_off`/
`power_state`, `up`/`down`/`left`/`right`/`select`/`home`/`menu`, `volume_up`/`volume_down`/
`set_volume`, `play_pause`, `channel_up`/`channel_down`, `launch_app`, `text_append`); `pyatv.dev`
confirms `--storage file` persists pairing credentials automatically, keyed internally by the
device's own stable identifier, resolved again from just `--address <ip>` on every later
command — no credential ever needs to pass through Hearth's own `device.config`, matching the
`playactor` (PS5)/`python-broadlink` (ADR-HEARTH-103) precedent of driving a well-established
library as a managed subprocess rather than reimplementing its protocol.

**Real correction found live, not from docs**: `atvremote --address <ip> --protocol mrp pair`
against an address with no live MRP service raises a real, catchable `pyatv.exceptions.
NoServiceError` rather than hanging — confirming the pairing subprocess needs a clear "couldn't
reach that Apple TV" error path, not just a PIN-prompt timeout, the same category of finding this
project has hit for every previous protocol worked out from source rather than assumed.

**Unrelated but discovered mid-build**: this same day, a separate concurrent Claude session was
building a Squirrel Feeder driver + tab-navigation rewrite (ADR-HEARTH-104) in this same working
directory. Coordinated directly session-to-session rather than guessing whether it was safe to
keep editing shared files — confirmed the Broadlink UI wiring carried over intact into the new
`DevicesTabScreen.tsx`, and confirmed a real, disclosed bug in `App.tsx`'s pre-existing
`refreshCapabilities()`: it unconditionally set `device.capabilities = driver.getCapabilities()`
on every persisted device at startup, which is correct for every driver except Broadlink's new
dynamic-capability model (ADR-HEARTH-103) — that overwrite would silently replace a device's
actually-taught, sparse capability list with the full teachable superset on every app launch,
making every untaught button appear to work until tapped.

## Decision

**Family Command Center**: `src/lib/network/apple-tv-client.ts` drives the real `atvremote` CLI
as a managed subprocess (same session-map/stdin-write pattern `ps5-client.ts` already established
for `playactor`) — `startAppleTvPairing`/`submitAppleTvPin`/`getAppleTvPairingStatus` for the
interactive PIN flow, `sendAppleTvCommand` for everything else. Four new routes under
`/api/integrations/hearth/appletv/` (`pair/start`, `pair/pin`, `pair/status`, `command`), same
bearer-token gate as every other `hearth/*` route.

**Hearth**: `AppleTvClient.ts` (fetch wrapper, mirrors `Ps5Client.ts`) and `AppleTvDriver.ts` — a
**fixed**-capability driver (unlike Broadlink), since every command has a real, universal,
protocol-documented meaning: `power` (a real toggle — read `power_state`, send the opposite of
`turn_on`/`turn_off`, same shape as `SonyBraviaDriver`'s own "power" case, since atvremote has
no single toggle call), `volumeUp`/`volumeDown`/`setVolume`, `directionalNavigation`, `select`,
`home`, `back` (mapped to atvremote's `menu` command — Apple's own remote UX treats the physical
Menu button as Back/Cancel, with no separate dedicated Back button, so there's no corresponding
second "menu" capability the way LG/Samsung have one), `playPause`, `channelUp`/`channelDown`,
`launchApp` (real bundle IDs, community-corroborated the same way `LgWebOsDriver`'s Amazon/Hulu
app ids are flagged, since Apple publishes no official bundle-id registry), and `textEntry` (via
`text_append`). `mute`, `setChannel` (digit entry), `inputSelection`, and `sleepTimer`/`settings`/
`openSourceList` are deliberately NOT declared — no corresponding `atvremote` command exists for
any of them. `AddAppleTvDeviceScreen.tsx` mirrors `AddPs5DeviceScreen.tsx`'s interactive-pairing
shape, simplified to one stage (PIN only, no browser step) since Apple TV pairing needs no
redirect URL at all.

**The `refreshCapabilities` fix**: added `hasDynamicCapabilities?: boolean` to `DeviceDriver`
(default/undefined = false, so every existing driver is unaffected), set `true` on
`BroadlinkIrDriver`, and guarded `App.tsx`'s `refreshCapabilities()` to skip any driver that
declares it — an explicit, driver-declared escape hatch rather than a fragile driver-id string
comparison. Added a regression test (`BroadlinkIrDriver.test.ts`) asserting the flag is set.

## Consequences

- MRP-only pairing for this version — pairing the newer Companion protocol too (pyatv's own
  recommendation for more reliable power control specifically) is a real, disclosed future
  enhancement, not built here.
- `launchApp`'s bundle IDs are community-corroborated, not from an official Apple registry —
  flagged the same way this project already flags its less-certain LG app ids, not silently
  presented as equally certain.
- Verified end-to-end on Family Command Center against the real network stack (not yet a real
  Apple TV): `pip3 install pyatv` succeeded; `npx tsc --noEmit` and `npm run build` both clean, all
  four routes present in the route table, service restarted and confirmed `active`; a live `curl`
  against both `pair/start` and `command` (real bearer token, dummy IP) returned real, clean
  `NoServiceError`/`NotSupportedError` messages surfaced correctly through the whole stack.
- Hearth side: `npx jest --silent` → 909/909 passing (18 new tests across `AppleTvClient.test.ts`
  and `AppleTvDriver.test.ts`, plus one new regression test for the `hasDynamicCapabilities` fix).
  `npx tsc --noEmit` clean. No native dependency added — fully OTA-shippable.
- Cross-session coordination worked cleanly: confirmed via direct message exchange (not guessed)
  that `App.tsx`/`DevicesTabScreen.tsx` were stable before touching them, and that
  `refreshCapabilities`'s bug was real and unfixed rather than assuming either.
- **Not yet verified against a real Apple TV** — no physical device on this network yet. The
  command surface, pairing flow, and storage behavior are all taken directly from `atvremote`'s own
  live `--help`/`commands` output and pyatv's own documentation, not guessed, but a first real
  pair-and-control cycle against physical hardware is the honest remaining gap, matching this
  project's own standard for new relay work (Sonos/Denon/Chromecast/Broadlink all carry the same
  caveat).
