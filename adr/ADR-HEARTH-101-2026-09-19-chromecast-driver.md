# ADR-HEARTH-101: Chromecast driver — relayed through Family Command Center from the start

**Date:** 2026-09-19
**Status:** Accepted, implemented

## Context

Continuing "work on every driver possible" — Chromecast was the #3 candidate from the earlier
new-integration research, and was already flagged (earlier the same day) as a bigger lift than
Sonos/Denon: the CastV2 control protocol needs a real TCP+TLS socket and Protobuf message
framing, not a plain HTTP/SOAP API.

**Architecture decision, informed by the same day's real lesson**: PS5's driver and SSDP discovery
were both originally built to run directly on the phone via `react-native-udp`, and both crashed
live on real hardware ("cannot read createSocket of null") because that library doesn't support
Expo SDK 57's mandatory New Architecture. Before repeating that pattern for Chromecast, the one
real phone-native candidate — `react-native-tcp-socket` — was checked first: it has an open,
unanswered GitHub issue specifically asking about New Architecture support, and no
`codegenConfig`/TurboModule markers in its own `package.json`. Given it shares low-level
implementation conventions with its already-failed sibling package, and this session doesn't have
time to burn a full EAS rebuild cycle just to find out live, Chromecast is built entirely
server-side on Family Command Center from the start — no gamble taken at all.

Verified against `home-assistant-libs/pychromecast` (the reference implementation):
- CastV2 message framing: a small, fixed 6-field Protobuf schema (`CastMessage` — protocol
  version, source/destination id, namespace, payload type, payload) confirmed directly against
  the project's own `.proto` source. Small and fixed enough to hand-roll a minimal encoder/decoder
  for, same precedent as this project's other small-format clients (Samsung, DDP/PS5) — no general
  protobuf library needed.
- Transport: TLS on port 8009, `rejectUnauthorized: false` (self-signed device cert — same trust
  model already used for LG's own SSAP WebSocket).
- Handshake: a `CONNECT` message on `urn:x-cast:com.google.cast.tp.connection` before anything else
  gets a real response.
- Control: `urn:x-cast:com.google.cast.receiver`'s `GET_STATUS`/`SET_VOLUME` — volume level (0.0-1.0
  scale) and mute both live in this one command's `volume` object.
- Discovery: mDNS, `_googlecast._tcp.local.`, port 8009 — built server-side too, via the
  `multicast-dns` npm package (an ordinary Node dependency, no native-module risk at all, unlike
  the React Native mDNS options this codebase already considered and avoided for the same New
  Architecture reasons).
- **No `power`, no `playPause`**: a Chromecast has no standby concept on this control surface
  (always network-listening, same as Sonos); play/pause needs a currently-running app's own
  session/transport id — a separate, bigger lookup this driver's client doesn't implement. Never
  claim a capability the protocol can't back up.

## Decision

New `src/drivers/streaming/chromecast/` (`ChromecastClient.ts` — pure `fetch` calls to Family
Command Center's new `/api/integrations/hearth/chromecast/*` routes, mirroring
`Ps5Client.ts`'s post-migration shape exactly; `ChromecastDriver.ts` — mirrors
`SonosDriver.ts`'s structure: no power, `volumeUp`/`volumeDown`/`setVolume`/`mute` only). New
`AddChromecastDeviceScreen.tsx` (IP-only, explicitly states Family Command Center is required —
unlike Sonos/Denon, there's no direct-from-phone path at all for this one). All the actual
protocol work (protobuf, TLS, mDNS) lives in Family Command Center's own
`adr/0176-hearth-chromecast-relay.md`.

## Consequences

- Chromecast ships with **zero new native dependency on Hearth's own side** — this driver is a
  pure HTTP relay from the app's perspective, fully OTA-shippable, same as Xbox and the
  post-migration PS5 driver.
- Chromecast is the first driver in this codebase to require Family Command Center from day one
  with no direct-connect fallback path at all (LG needs it for TLS-trust reasons but that's a
  narrower gap; PS5 needs it only for pairing, not for the everyday wake). Documented directly in
  the Add screen's own hint text, not hidden.
- Volume stays in the protocol's own 0.0-1.0 scale, not converted to 0-100 — consistent with
  Denon's own dB-scale precedent, confirmed safe for the same reason (no UI renders it as a slider).
- Verified: `npx jest src/drivers/streaming/chromecast --silent` (13/13) and full
  `npx jest --silent` → 456/456 passing. `npx tsc --noEmit` clean.
- **Not yet verified against a real Chromecast** — Family Command Center's own live mDNS scan test
  found zero devices (no confirmed Chromecast hardware on this network to test against yet). The
  protobuf encoder/decoder and full CastV2 handshake are real, sourced protocol work, not guessed,
  but unverified against actual hardware is a real, honestly-flagged gap, same treatment as PS5's
  own still-pending pairing confirmation.
