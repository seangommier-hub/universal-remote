# ADR-HEARTH-119: Sony gets the same MAC-based self-healing LG/Samsung/Roku already have

**Date:** 2026-09-21
**Status:** Accepted, implemented

## Context

While looking for the next valuable improvement ("keep going and making this improved," no
specific target given), an audit of every LAN-IP-based driver found a real, consistent gap:
`SonyBraviaDriver.ts` — the very first TV driver built in this project (Phase 1) and Sean's own
real, tested hardware — never got the MAC-based IP self-healing that LG (ADR-HEARTH-017),
Samsung, and Roku (ADR-HEARTH-109) all already have. A Sony TV that moves to a different network
(the same real scenario that hit this household's Hisense/Roku and one of its two LG TVs earlier
this session) would keep retrying the same dead IP forever instead of re-locating itself.

Nine drivers were audited (`grep` for `findCurrentIpByMac` across every driver file); only LG,
Samsung, and Roku had it. Sony is the highest-confidence fix to make right now — real, owned,
already-tested hardware, and the oldest unaddressed instance of a gap this project has already
fixed three times elsewhere. The other six (Denon, Yamaha, Chromecast, Sonos, Xbox, PS5, Apple TV,
Kasa) are left as an open follow-up, not silently expanded to in this same pass.

## Decision

Mirrors LgWebOsDriver.ts's/RokuEcpDriver.ts's identical fix exactly: on any reachability failure,
check whether Family Command Center currently sees this device's MAC (or, if none is saved yet, its
name) at a different address, and retry once at whatever it finds — persisting the corrected
address onto `device.config` in place (picked up by App.tsx's normal save-on-connect path) and
backfilling a missing MAC via a reverse IP lookup so the *next* move is caught by the faster path.

Structurally different from Roku's `connectClient` wrapper because Sony's `refreshState()` reads
power and volume as two REST calls in parallel (`Promise.all`), not Roku's single `getDeviceInfo()`
call — the raw parallel read was split into its own `fetchLiveState()`, and the self-healing logic
wraps it as `fetchLiveStateWithSelfHeal()`, which `refreshState()` now calls instead of building
the `Promise.all` inline. This one change point covers both real trigger paths, same as the other
three drivers: the initial `connect()` (via `doConnect() → refreshState()`) and every backoff retry
(`scheduleReconnect`'s timer also calls `refreshState()` directly).

## Testing

Testing this needed a different approach than Roku/LG's existing self-heal tests: those rely on
mocking a deterministic sequence of `fetch` calls via chained `mockResolvedValueOnce`, which
depends on calls landing in source-code order — true for a single sequential call, not guaranteed
for two `Promise.all`-parallel calls whose underlying `fetch` invocations race. Routed the mock by
URL instead (stale IP → reject; the FCC relay endpoint → reject; the FCC device-lookup endpoint →
return the new address; the new IP's own endpoints → return real data), which is correct regardless
of call ordering. 3 new tests: successful re-discovery by MAC, a genuinely dead device correctly
staying failed (not silently hanging), and the no-saved-MAC name-based fallback with backfill —
matching RokuEcpDriver.test.ts's equivalent three-test shape. `npx tsc --noEmit` clean; full suite
931/931 passing.

## Consequences

- Sony now recovers automatically from a network move, closing the oldest instance of a gap this
  project has already fixed three times elsewhere.
- Not yet live-verified against a real network move on Sean's actual Sony TV — the mechanism is
  identical to LG/Samsung/Roku's already-shipped, already-relied-upon version, but this specific
  driver's application of it hasn't been observed live.
- Denon, Yamaha, Chromecast, Sonos, Xbox, PS5, Apple TV, and Kasa remain without this fix — a
  real, tracked gap, not an oversight. Worth its own pass, prioritized by which of those Sean
  actually owns and has hit stale-IP problems with, rather than applied blanket to all eight
  speculatively.
