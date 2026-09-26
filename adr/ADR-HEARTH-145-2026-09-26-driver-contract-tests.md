# ADR-HEARTH-145: Driver connection contract test suite

**Date:** 2026-09-26
**Status:** Accepted (tests only; the bugs below are documented, not fixed)

## Context

Several connection bugs this week were only caught on real hardware: a request with no timeout that hung
`connect()` forever (LG, fixed), a reconnect timer leaking across tests (Apple TV/Kasa), a driver
reporting "connected" after its socket silently died (LG, fixed by ADR-HEARTH-132), and a connect
failure that scheduled no retry (Apple TV/Kasa, fixed). Each was found and fixed in one driver while
the same shape of bug could sit in the others. Per-driver test files mock each driver's own client,
so they cannot see bugs in the client layer (a `fetch` with no timeout) and they do not share
assertions.

## Decision

One parametrized contract suite runs identical behavioral assertions against every driver.

- `src/testUtils/contractNetwork.ts`: a fake global `fetch` and `WebSocket` with three modes:
  `up` (device answers), `refuse` (fast failure) and `hang` (black hole: fetch only settles if the
  caller aborts it, sockets never open). Faking the two primitives rather than each client is what
  lets the suite catch client-layer defects.
- `src/drivers/contract/adapters.ts`: one adapter per driver (17 drivers): constructor, fresh
  Device, the fake device's replies, and one network-touching command.
- `src/drivers/contract/exemptions.ts`: the exemption table (below).
- `src/drivers/driverContract.test.ts`: the cases, jest fake timers throughout.
- `src/drivers/contract/relayRecovery.test.ts`: dedicated regression test for bug 1 (shared layer).

### Contract cases

| Case | Assertion |
|---|---|
| connectHangRejects / connectRefuseRejects | connect() to a black-holed or refusing device rejects within 120s of fake time, never hangs, and getState() is `disconnected` |
| retryAfterFailure | after a failed connect the driver reaches `connected` by itself once the device answers (within 60s, past the 30s backoff cap) |
| disconnectCancelsRetries | disconnect() cancels the pending retry: no network attempt, no state notification, `jest.getTimerCount() === 0` over the next 10 minutes |
| disconnectDuringInflightConnect | disconnect() while a connect is in flight leaves no retry loop, does not resurrect the connection, no leaked timers |
| connectDedupe | 5 concurrent connect() calls cost exactly as many network attempts as 1 |
| commandWhileHungRejects | a command to a device that stopped answering rejects within 30s |
| commandFailureMarksDisconnected | a command that fails on a refused connection leaves the driver `disconnected` |
| subscribeNotifies | listeners hear `connected` then `disconnected`; after unsubscribe nothing more is delivered |
| socketDropReconnects (LG, Samsung) | a socket closing under a connected driver is reported `disconnected` and reconnects by itself |
| silentDeathDetected (LG, Samsung) | a socket that stops answering with no close event is eventually not reported `connected` |

Exemptions run as `test.skip` (by design, reason in the test name) or `test.failing` (real bug,
number in the test name). `test.failing` keeps the suite green today and turns it red the moment
the bug is fixed, which is the signal to delete the exemption. A retry test isolates the driver
from bug 1 by resetting the relay cache, so bug 1 cannot mask real retry defects.

### By-design exemptions (documented, not bugs)

- **Xbox, PS5, Broadlink: connectHang, connectRefuse, retryAfterFailure, commandFailureMarksDisconnected.**
  connect() only validates saved config and performs no network I/O (ADR-HEARTH-064, 099, 103). Xbox and
  PS5 are deliberately never probed so a reachability check cannot wake a console. Their state is a
  config claim, so a failed send leaves it alone.
- **Hue, squirrel feeder: retryAfterFailure.** Stateless per-request HTTP with no reconnect-backoff
  machinery (ADR-HEARTH-032, ADR-HEARTH-104).
- **LG: commandFailureMarksDisconnected.** A persistent socket's health is owned by `onclose` and the
  ADR-HEARTH-132 heartbeat (silentDeathDetected passes for LG), not by one command timing out.
- **Samsung: commandWhileHungRejects, commandFailureMarksDisconnected, silentDeathDetected.** ADR-HEARTH-143:
  no documented probe exists. Note this ADR says a key press "fails" on a dead socket, but `sendKey` is
  fire-and-forget: the contract shows it resolves successfully against a deaf socket, so the user gets
  neither an error nor a state change. Accepted by 143, recorded here so the consequence is explicit.

### Real bugs found (not fixed: production code is out of scope for this change)

1. **`requestWithRelayFallback` poisons its cache on any direct failure** (`src/core/network/httpRelayFallback.ts`,
   `knownRelayOnly.add(key)` in the catch, about line 176). A single direct failure, including a device
   that was merely switched off, marks the address "relay only" for the app session even when the relay
   itself then fails. With Family Command Center not configured every later request, including every driver
   retry, throws "isn't configured for relay fallback" without ever trying the direct path, so a Roku, Sony,
   Denon, Yamaha, Sonos, Hue or feeder that blips never recovers until the app restarts. With FCC configured
   it recovers but permanently detours through the relay. `wsRelayFallback` does this correctly (only records
   the failure after the relay succeeds). Repro: `relayRecovery.test.ts` (refuse, then up, second request never
   goes direct). Fix direction: add to the cache only when the relay leg succeeds.
2. **`AppleTvClient.fccRequest` has no timeout** (`src/drivers/tv/appletv/AppleTvClient.ts:25`). `connect()`
   and every command hang forever when FCC or the network black-holes. Cases: connectHangRejects, commandWhileHungRejects.
3. **`ChromecastClient.fccRequest` has no timeout** (`ChromecastClient.ts:26`). Same two cases.
4. **`SwitchBotClient` has no timeout** (`SwitchBotClient.ts:93, 99, 104`). Same two cases.
5. **`BroadlinkClient.fccRequest` has no timeout** (`BroadlinkClient.ts:18`). A learned-code send hangs.
6. **`Ps5Client.fccRequest` has no timeout** (`Ps5Client.ts:28`). The wake command hangs.
7. **`XboxDriver.executeCommand` calls `fetch` with no timeout** (`XboxDriver.ts`, the poweron POST). The wake command hangs.
   Bugs 2 to 7 are the same class as the LG hang fixed earlier and the Kasa/SmartThings clients already
   have the right pattern (`AbortController` plus `FCC_REQUEST_TIMEOUT_MS`). Repro for each: `hang` mode,
   `connect()`/command stays pending after 120s/30s of fake time.
8. **LG and Samsung leave a zombie retry loop when `disconnect()` lands during a failing connect**
   (`LgWebOsDriver.ts` connect() catch about line 224, `SamsungTizenDriver.ts` about line 173). The catch
   calls `scheduleReconnect` unconditionally, without checking the disconnect generation. Repro:
   connect() to a black hole, disconnect() at once, wait: a new socket attempt fires later and the device
   reconnects after the user removed it. The same shape as ADR-HEARTH-052.
9. **LG and Samsung leave `getState()` at `"unknown"` after a failed first connect** instead of
   `"disconnected"`; only a previously connected device gets `"disconnected"` (via `onclose`). Any UI keyed on
   `disconnected` (reconnect card, diagnostics ADR-HEARTH-142) sees a third state.
10. **Sony, Denon, Yamaha, Sonos and Chromecast do not mark disconnected or start a retry when a command fails**
    (`executeCommand` in each). The catch lives only in `refreshState`, which a failing command never reaches, so
    the driver keeps reporting `connected` and no reconnect loop starts. This contradicts ADR-HEARTH-017's
    "device dropping out during normal use" goal; Roku, Kasa, Apple TV and SwitchBot do it correctly.
11. **Hue, SmartThings and the feeder do not dedupe concurrent `connect()` calls** (low severity: one
    idempotent GET each, no retry loop to stack).
12. **SmartThings schedules no retry after a failed connect, and no ADR records that as intended**
    (`SmartThingsOutletDriver.ts` connect()). Hue and the feeder document theirs; this is the shape that was
    fixed for Kasa and Apple TV.

## Consequences

- 158 cases: 18 `test.skip` (by-design exemptions) and 24 `test.failing` (bugs 1 to 12) among the 140 passing. Fixing a bug makes its `test.failing` go red, prompting removal of the exemption.
- New drivers must add an adapter; the suite then holds them to the same contract.
- No production file changed.
