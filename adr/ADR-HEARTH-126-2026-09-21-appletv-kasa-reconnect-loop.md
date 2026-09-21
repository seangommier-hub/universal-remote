# ADR-HEARTH-126: Give Apple TV and Kasa the standard reconnect loop + self-healing

**Date:** 2026-09-21
**Status:** Accepted, implemented, tested

## Context

ADR-HEARTH-120 (Denon/Yamaha/Chromecast/Sonos self-healing) explicitly flagged that Apple TV and
Kasa were the last two per-request drivers in the project missing the baseline auto-reconnect loop
(ADR-HEARTH-017) that every other LAN driver already has: LG, Samsung, Roku, Sony, Denon, Yamaha,
Chromecast, Sonos all detect a failed request, mark the device disconnected, and retry on an
exponential backoff — Apple TV and Kasa just threw and left the device stuck disconnected forever,
with nothing to bring it back once real connectivity returned. Sean: "keep going," continuing the
session's driver-reliability sweep rather than a newly-scoped ask.

## Decision

Applied the exact same shape used by every other driver this session (connect/doConnect →
fetchLiveState/fetchLiveStateWithSelfHeal → refreshState → scheduleReconnect, with
`inFlightConnects`/`generations`/`reconnectTimers` bookkeeping) to both `AppleTvDriver.ts` and
`KasaPlugDriver.ts`, including the MAC-then-name self-healing re-discovery through Family Command
Center (matching LG/Samsung/Roku/Sony/Denon/Yamaha/Chromecast/Sonos). `executeCommand`'s failure
path on both now also calls `scheduleReconnect`, matching the rest of the fleet — previously it
only marked the device disconnected without ever retrying.

## A real test-pollution bug found and fixed along the way

Adding `scheduleReconnect` to `connect()`'s failure path had a side effect neither file's test
suite was written for: a **pre-existing** test that simply asserts "connect() marks disconnected
and rethrows" now *also* starts a real 2000ms `setTimeout` it never cleans up. That dangling timer
survives past its own test (a fresh `driver` is created per test, but the module-level `device`
object and the shared `jest.fn()` mock are not reset) and can fire *during a later test's own
2100ms reconnect-wait window*, consuming that later test's queued mock response out of the shared
FIFO queue before the intended caller gets to it — exactly the same pollution class found live in
the SwitchBot driver tests earlier this session (ADR-HEARTH-118), just triggered by a passing
reconnect timer instead of a wrongly-classified validation error.

Fixed with a global `afterEach(async () => { await driver.disconnect(device); })` in both test
files — `disconnect()` clears any pending reconnect timer for that device id, and is safe to call
whether or not the driver ever actually connected. Since `reconnectTimers` is keyed by
`device.id` (stable across every device-config variant used in a file's tests), one `afterEach`
call cleans up regardless of which specific device object the just-finished test used.

## Testing

`AppleTvDriver.test.ts`: 17/17 passing (2 new automatic-reconnect tests + 3 pre-existing
re-discovery tests, now stable). `KasaPlugDriver.test.ts`: 29/29 passing across both worktree
copies (5 new tests: 2 automatic-reconnect + 3 re-discovery). `npx tsc --noEmit` clean. Full
project suite: 969/969 passing (964 baseline + 5 net-new Kasa tests).

## Consequences

- Every per-request LAN driver in the project (LG, Samsung, Roku, Sony, Denon, Yamaha, Chromecast,
  Sonos, Apple TV, Kasa) now has the same reconnect-loop + self-healing behavior. Xbox/PS5 remain
  the deliberate exceptions (no reachability check at all, by design, to avoid waking a console —
  unchanged from ADR-HEARTH-120).
- Any future driver test that triggers a real failure path should either use `afterEach` cleanup
  (as done here) or `mockRejectedValue` (persistent, not `Once`) if it doesn't care whether a later
  dangling retry keeps failing — the `Once` + no-cleanup combination is the actual trap.
