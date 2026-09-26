# ADR-HEARTH-144: Reconnect fast after Wake-on-LAN, and jitter the backoff

**Date:** 2026-09-26
**Status:** Accepted, implemented

## Context

Sean, live: "connection isn't persistent and I cannot turn the devices on when they are off."

Pressing power on an off TV sends a Wake-on-LAN packet through Family Command Center (ADR-HEARTH-102).
The drivers (LG, Samsung, Sony) then only report that the packet was sent. Connection state stays
"disconnected" and each driver's normal reconnect backoff (2s doubling to 30s) decides when to try
again. The TV can be fully on within a few seconds while the next scheduled retry is up to 30s away,
so the remote feels dead exactly when a real remote would feel instant.

Separately, every driver backs off on the same 2s/4s/8s schedule. A router restart or power blip drops
many devices at the same moment, and they then all retry on the same tick.

## Decision

1. `src/drivers/shared/wakeBurst.ts` (`WakeBurstController`): after a successful Wake-on-LAN, retry the
   driver's own `connect()` on a fixed cadence (`WAKE_BURST_INTERVAL_MS` = 2s) for at most
   `WAKE_BURST_WINDOW_MS` = 60s. It ends as soon as an attempt succeeds. Attempts never overlap (the
   next is scheduled only after the previous settles), and the controller allows one burst per device id.
2. Wired into `LgWebOsDriver`, `SamsungTizenDriver` and `SonyBraviaDriver`, the only drivers with a
   Wake-on-LAN path (Roku, Denon, Yamaha, Chromecast, Apple TV, Xbox/PS5 have none).
3. The burst reuses the existing bookkeeping instead of adding a second loop:
   - Attempts call `connect()`, so `inFlightConnects` dedupes against any concurrent connect and the
     generation counters still discard stale results.
   - While a burst is active, `scheduleReconnect` returns early so the slow backoff never runs beside
     it. Starting a burst also clears any pending slow timer.
   - `disconnect()` stops the burst.
   - If the window ends with no answer, `onExhausted` calls the normal `scheduleReconnect`. The device
     falls back to the slow backoff and is never left silent, and there is no infinite fast loop.
4. Honest state: nothing in the burst sets "connected". The connection stays "disconnected" until a real
   `connect()` succeeds.
5. `src/drivers/shared/backoffJitter.ts` (`withBackoffJitter`): adds up to `BACKOFF_JITTER_FRACTION` = 20%
   to every backoff delay. Applied in all eleven drivers that compute exponential backoff. The
   `random` source is an injectable parameter defaulting to `Math.random`.

## Alternatives considered

- Shorten the global backoff cap: rejected, it would make a genuinely offline device retry aggressively
  forever. The fast cadence is bounded to the moments after the user asked the device to turn on.
- Poll the device with a lightweight probe instead of a full `connect()`: rejected, `connect()` is the
  only check that proves the remote is usable, and reusing it inherits the dedupe and generation guards.

## Testing

- `wakeBurst.test.ts` and `backoffJitter.test.ts` (fake timers): answers on the 3rd attempt, gives up
  after the window exactly once, `stop()` cancels, attempts never overlap, restart replaces a burst,
  jitter bounds.
- LG and Sony driver tests: device answers on the 3rd burst attempt; device never answers, so the burst
  ends and the slow backoff takes over; `disconnect()` cancels the burst.
- Existing driver tests that assert exact reconnect delays pin `Math.random` to a near-zero constant
  (not 0, which makes jest internals recurse), so their assertions are unchanged. Wake tests in the LG,
  Samsung and Sony suites now disconnect in `afterEach` so a burst timer cannot leak into the next test.

## Consequences

- A TV that boots normally becomes usable within about one 2s tick of answering, instead of up to 30s.
- Worst case while a TV stays off after a wake: 30 connect attempts over 60s, then the normal backoff.
- Backoff delays are now up to 20% longer than before, in exchange for de-synchronised retries.
- Known limit: Sony's HTTP relay layer remembers a direct failure per address for the session
  (`knownRelayOnly`), so after waking a Sony TV the burst reaches it through the Family Command Center
  relay rather than directly. That works for Sean's setup, but a Sony TV with no relay configured would
  not recover on its own. Not changed here.
