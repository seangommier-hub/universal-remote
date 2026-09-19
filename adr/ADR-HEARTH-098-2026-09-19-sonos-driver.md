# ADR-HEARTH-098: Sonos driver — first new integration beyond the original 9 brands

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

Sean: "work on every drivers possible, we spoke about this" — following up on the roadmap's "New
integrations researched" tier, which ranked Sonos #1 (simplest, zero-config local protocol, no
pairing). Verified directly against SoCo (github.com/SoCo/SoCo), the de facto reference
implementation the Home Assistant/openHAB/every other Sonos integration is built on:

- Control is plain SOAP/UPnP over HTTP, port 1400, no authentication of any kind — `POST
  http://<ip>:1400/{RenderingControl|AVTransport}/Control` with a documented SOAP envelope and
  `SOAPACTION` header, verified byte-for-byte against `soco/services.py`'s own header/body
  construction.
- Volume/mute: `RenderingControl` service's `GetVolume`/`SetVolume`/`GetMute`/`SetMute`, each
  taking `InstanceID=0, Channel=Master` — verified against `soco/core.py`'s `volume`/`mute`
  property implementations.
- Play/pause: `AVTransport` service's `Play`/`Pause`/`GetTransportInfo` (`Speed=1` argument),
  same source.
- Discovery: standard SSDP, `ST: urn:schemas-upnp-org:device:ZonePlayer:1` — verified against
  `soco/discovery.py`.
- No `power` capability: confirmed no power-off/standby method exists anywhere in SoCo — a Sonos
  Zone Player has no such concept on this control surface, unlike an AV receiver. Not declared,
  matching this project's "never claim a capability the protocol can't back up" rule.

## Decision

New `src/drivers/audio/sonos/` (`SonosClient.ts` — generic SOAP `call()`, mirroring
`SonyBraviaClient.ts`'s generic JSON-RPC `call()` shape; `SonosDriver.ts` — mirrors
`YamahaMusicCastDriver.ts`'s structure: reconnect-on-failure timer, generation-tracked
disconnect-race guard, `refreshState()` always re-reads rather than trusting a command's own
result). New `audio` `DeviceCategory` icon added to `DeviceListScreen.tsx`'s `CATEGORY_ICON` map
(the type already existed; nothing had used it yet). Wired into both discovery paths (SSDP search
target, Family Command Center brand matcher on `/sonos/i` — "Sonos, Inc." is Sonos's real MAC OUI
vendor string) and a manual `AddSonosDeviceScreen.tsx` (IP-only, no credential field, same shape
as Yamaha's). `playbackState` values ("playing"/"paused") reuse the exact field name
`useNowPlaying.ts` already reads — Sonos plugs into the existing now-playing widget with zero
widget-side changes.

## Consequences

- Sonos speakers are now a fully supported brand: discoverable (SSDP + Family Command Center),
  addable, controllable (volume/mute/play-pause), and show up in the now-playing widget.
- Track metadata (title/artist/artwork) is not read — Sonos's `AVTransport` exposes this via
  `GetPositionInfo`/`GetMediaInfo`, deliberately out of scope for this first pass; the now-playing
  widget falls back to its existing generic "Now Playing" title for this driver, same fallback
  Roku/LG already use when their own richer field is unavailable.
- Grouping (Sonos's multi-room "bind speakers together" feature) is not implemented — a real,
  separate feature or scope decision, not assumed as part of "supports Sonos."
- Verified: `npx jest src/drivers/audio/sonos src/discovery --silent` and full `npx jest --silent`
  → 414/414 passing (was 395; +18 Sonos-specific + 1 SSDP target test). `npx tsc --noEmit` clean.
