# ADR-HEARTH-120: MAC-based self-healing reconnect for Denon, Yamaha, Chromecast, Sonos

**Date:** 2026-09-21
**Status:** Accepted, implemented

## Context

Direct continuation of ADR-HEARTH-119's audit — Sean said "go" to keep applying the same fix
across the remaining drivers found missing it. Of the 9 LAN-IP-based drivers audited, 4 more
(Denon, Yamaha, Chromecast, Sonos) had a working auto-reconnect loop (`scheduleReconnect`,
matching ADR-HEARTH-017's whole-app standard) but, like Sony before this pass, never checked
Family Command Center for a moved device's new address — they'd retry the same dead IP forever.

## Decision

Same fix, same reasoning, applied to each:

- **`DenonDriver.ts`** and **`YamahaMusicCastDriver.ts`**: single `getStatus()` call each — the
  simplest case, structurally identical to `RokuEcpDriver.ts`'s original fix. `fetchLiveState` /
  `fetchLiveStateWithSelfHeal` split, same as Sony.
- **`ChromecastDriver.ts`**: also a single call, but every request already goes through Family
  Command Center's relay unconditionally (no direct-LAN leg at all — this driver's own doc comment
  already explains why, ADR predates this session). Self-healing still applies: the `ipAddress` in
  `device.config` is the Chromecast's own LAN address that FCC relays *to*, and that's exactly what
  goes stale when the device moves networks.
- **`SonosDriver.ts`**: a 3-way `Promise.all` (volume, mute, transport state), the same structural
  complexity as Sony's power+volume pair — `fetchLiveState`/`fetchLiveStateWithSelfHeal` wraps all
  three.

## Testing

Denon/Yamaha/Chromecast (single-call): standard sequential `mockResolvedValueOnce` chaining, same
shape as `RokuEcpDriver.test.ts`'s original self-heal tests. Sonos (parallel calls): URL-routed
fetch mocking, same technique ADR-HEARTH-119 introduced for Sony — with one added wrinkle: Sonos's
`GetVolume` and `GetMute` SOAP actions hit the *identical* URL (`/RenderingControl/Control`), so
the test router also inspects the `SOAPACTION` header to tell them apart. 8 new tests total (2 per
driver: successful re-discovery, and a genuinely dead device correctly staying failed).
`npx tsc --noEmit` clean; full suite 939/939 passing.

## What was deliberately NOT touched

Auditing the remaining 4 drivers surfaced two genuinely different situations, not silently folded
into this same fix:

- **XboxDriver.ts, Ps5Driver.ts**: architecturally exempt by design, not an oversight. Both are
  power-on-only with no reachability check of any kind — `connect()` does no network probe at all,
  documented directly in each driver's own class comment, because probing would risk an unwanted
  side effect (waking a console just to "test" adding it). There's no reachability-failure moment
  for self-healing to hook into.
- **AppleTvDriver.ts, KasaPlugDriver.ts**: a real, different, *bigger* gap than what this ADR and
  ADR-HEARTH-119 fix. Neither has `scheduleReconnect`/a reconnect-timer/backoff loop at all — the
  baseline auto-reconnect behavior ADR-HEARTH-017 established as a whole-app standard is missing
  entirely, not just the self-healing layer on top of it. Bolting MAC-based re-discovery onto a
  driver with no retry loop to trigger it from wouldn't accomplish anything; building the
  underlying reconnect infrastructure first is a separate, real piece of work, flagged here rather
  than attempted in the same pass.

## Consequences

- Every LAN-IP driver with an existing reconnect loop (LG, Samsung, Roku, Sony, Denon, Yamaha,
  Chromecast, Sonos — 8 of 9) now self-heals from a network move. Only Apple TV and Kasa remain,
  blocked on the larger, separate reconnect-loop gap above.
- Not yet live-verified against real hardware for any of these four — the mechanism is identical
  to the already-shipped, already-relied-upon LG/Samsung/Roku/Sony version, but this specific
  application of it to Denon/Yamaha/Chromecast/Sonos hasn't been observed live.
