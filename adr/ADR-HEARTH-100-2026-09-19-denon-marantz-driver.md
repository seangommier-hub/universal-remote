# ADR-HEARTH-100: Denon/Marantz driver

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

Continuing "work on every driver possible" — Denon/Marantz was the #2 candidate from the earlier
new-integration research (Sonos was #1, shipped as ADR-HEARTH-098). Verified against
`ol-iver/denonavr` (the actively-maintained reference implementation both Home Assistant's own
integration and this research are built on) and its own real captured device fixture
(`tests/xml/AVR-1713-formMainZone_MainZoneXmlStatus.xml`):

- Control is a legacy, unauthenticated HTTP GET surface (`formiPhoneApp*` endpoints, port 80) —
  `formiPhoneAppPower.xml?1+PowerOn`/`PowerStandby`, `formiPhoneAppDirect.xml?MVUP`/`MVDOWN`,
  `formiPhoneAppVolume.xml?1+{db}`, `formiPhoneAppMute.xml?1+MuteOn`/`MuteOff` — every value
  verified against `denonavr/const.py`'s own URL constants, not guessed.
- Status read: `formMainZone_MainZoneXmlStatus.xml`, a nested `<Tag><value>X</value></Tag>` XML
  shape confirmed against a real captured device response, not just the library's parsing code.
- Marantz shares this exact protocol (`denonavr` itself supports both brands under one library;
  its own `const.py` only has a handful of Marantz-only extras this driver doesn't need).
- **Real, verified protocol quirk**: `MasterVolume` is reported in dB (e.g. `-67.0`), not a 0-100
  percentage like every other driver here. Converting it would need the receiver's own
  model-specific max-volume ceiling (`MVMAX`), which isn't reliably present in this status
  endpoint — rather than invent an unverified conversion formula, this driver passes the real dB
  value straight through as `volume`. Confirmed safe to do: `state.values.volume` is rendered as
  plain text in a status pill (`UniversalTvRemote.tsx`), not a 0-100 slider, and nothing currently
  drives `setVolume` from a UI control that would need it normalized.
- **No `playPause`, no `inputSelection`**: verified there's no playback-state field in the status
  endpoint this client reads (`NS9A`/`NS9B` are fire-and-forget Play/Pause commands, not a single
  self-toggling key like Roku's own Play button — a toggle needs to already know current state,
  which isn't available here), and no verified real input-code list for a specific receiver model.
  Same "never claim a capability the protocol can't back up" rule as every other driver.

## Decision

New `src/drivers/tv/denon/` (`DenonClient.ts`, `DenonDriver.ts` — mirrors `YamahaMusicCastDriver.ts`'s
structure exactly: reconnect-on-failure timer, generation-tracked disconnect-race guard,
`refreshState()` always re-reads). Capabilities: `power`, `volumeUp`, `volumeDown`, `setVolume`,
`mute`. New `AddDenonDeviceScreen.tsx` (IP-only, no credential field, same shape as
Yamaha/Sonos). Wired into Family Command Center's brand matcher (`/denon|marantz|d&m holdings/i`)
— NOT into SSDP's search targets, since SSDP is currently non-functional on real devices
(ADR-HEARTH-099's addendum — `react-native-udp` doesn't support Expo SDK 57's mandatory New
Architecture) and adding a target there right now wouldn't do anything.

## Consequences

- Denon/Marantz receivers are now a fully supported brand for power/volume/mute — the two biggest
  gaps (no normalized volume percentage, no play/pause) are documented, verified absences, not
  oversights.
- Volume displays and accepts the receiver's own dB scale directly (e.g. `-52.5`, not `48`) — a
  real, deliberate departure from every other driver's 0-100 convention, called out in the Add
  screen's own hint text so it isn't a silent surprise.
- Verified: `npx jest src/drivers/tv/denon --silent` (15/15) and full `npx jest --silent` →
  440/440 passing. `npx tsc --noEmit` clean. Pure HTTP, no native dependency — fully OTA-shippable.
