# ADR-HEARTH-109: Roku driver gains the same MAC-based self-healing LG/Samsung already have

**Date:** 2026-09-20
**Status:** Accepted, implemented

## Context

Directly triggered by a real, live incident: the household's own Hisense/Roku TV moved off the
router's isolated Guest/IoT segment (`192.168.200.9`) onto the Pi's own hosted "Sewer Rat" kids AP
(confirmed live: real IP `10.20.30.237`, real `<device-info>` response over Roku's ECP, found via
the Pi's own ARP table after `192.168.200.9` turned out to be completely unreachable even from
Family Command Center itself — not just from Sean's phone).

`RokuEcpDriver.ts` had no mechanism at all to notice this — unlike `LgWebOsDriver.ts` and
`SamsungTizenDriver.ts`, which both already re-locate a device by MAC (`findCurrentIpByMac`) or,
lacking a saved MAC, by hostname (`findCurrentIpByName`) on any connect failure, Roku's driver just
retried the same dead IP forever on `scheduleReconnect`'s exponential backoff. A device moving
networks — genuinely common in this household already, per the exact same self-healing already
built for LG/Samsung — silently stayed broken instead of fixing itself.

## Decision

Added `RokuEcpDriver.connectClient()`, mirroring `LgWebOsDriver`/`SamsungTizenDriver`'s identical
method exactly: on any `getDeviceInfo()` failure (not gated to a specific error type — a
stale-but-now-reused IP can fail in the same shapes as a genuinely dead one), look up the device's
current address via `findCurrentIpByMac` (or `findCurrentIpByName` for a device added before
`hwaddr` was saved), retry once at whatever address is found, persist the corrected IP onto
`device.config`, and backfill a missing `hwaddr` via `findMacByIp` so the *next* move is caught by
the faster MAC lookup instead of needing the name-fallback again. Safe to try unconditionally: if
nothing better is found, the original failure still propagates unchanged.

## Consequences

- Every driver with a persistent notion of "this device's saved IP" (LG, Samsung, now Roku) shares
  the identical self-healing shape — Sony/Chromecast/Denon/Yamaha don't need it (Sony re-resolves
  fresh every single call already; the others weren't in scope for this fix).
- `npx jest --silent` → 913/913 passing (3 new regression tests: re-locates by MAC, backfills a
  missing MAC via a name-based lookup, and confirms a genuinely unreachable device still surfaces
  a real error rather than hanging silently). `npx tsc --noEmit` clean.
- Ships via plain `eas update` — no native change, JS/TS only. Published to the `preview` branch
  explicitly (per ADR-HEARTH-107's fix), not `--auto`.
- Sean still needs to correct (or add fresh) the Hisense TV's saved address in the app once, by
  hand, to `10.20.30.237` — this fix prevents the *next* move from going stale silently, it doesn't
  retroactively fix a device that was never reachable in the first place.
