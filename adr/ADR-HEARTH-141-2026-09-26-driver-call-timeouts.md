# ADR-HEARTH-141: Every driver network call is bounded by a timeout

**Date:** 2026-09-26
**Status:** Accepted, implemented

## Context

`LgWebOsClient.call()` once had no timeout: one unanswered request hung `connect()` forever and the
driver sat on "Reconnecting..." with zero network activity. That was fixed for LG with
`CALL_TIMEOUT_MS`. Hearth's goal is a persistent, reliable connection, so the same class of bug
(a promise that can wait forever) must not exist in any other client. This ADR records a full audit
of every network call under `src/core/network`, `src/discovery`, and `src/drivers`.

## Audit: unbounded calls found (all fixed)

All were bare `fetch()` calls to Family Command Center with no `AbortController` or timer:

| Call site | Used for |
|---|---|
| `core/network/wakeOnLan.ts` `sendWakeOnLan` | Wake-on-LAN relay |
| `discovery/familyCommandCenterConfig.ts` `verifyAndSaveFamilyCommandCenterConfig` | Settings "verify address + token" |
| `discovery/SsdpDiscoveryProvider.ts` `runFccFallbackScan` | SSDP sweep fallback (only bounded if the caller aborted) |
| `drivers/gaming/ps5/Ps5Client.ts` `fccRequest` | PSN login / pairing |
| `drivers/gaming/xbox/XboxDriver.ts` `executeCommand` | Xbox power-on |
| `drivers/irHub/broadlink/BroadlinkClient.ts` `fccRequest` | Broadlink learn / send |
| `drivers/streaming/chromecast/ChromecastClient.ts` `fccRequest` | Chromecast status / volume / mute |
| `drivers/tv/appletv/AppleTvClient.ts` `fccRequest` | Apple TV pairing / command |
| `drivers/inputRelay/vnc/RfbClient.ts` `connect` | VNC handshake: `openSocket` and every `readBytes` could wait forever for a silent server |

## What changed

- `src/core/util/withTimeout.ts`: single-purpose promise-vs-timer race. Always clears its timer,
  and rejects even if the wrapped promise never settles (it does not rely on the underlying API
  honouring an abort signal).
- `src/core/network/fetchWithTimeout.ts`: the one shared fetch wrapper. Named constants
  `DEFAULT_FETCH_TIMEOUT_MS` (8 s, matching every existing FCC call) and `LONG_FETCH_TIMEOUT_MS`
  (30 s). Rejects with `FetchTimeoutError`: "Request to <host> timed out after N seconds". A
  caller-supplied `signal` still cancels the request.
- `httpRelayFallback.ts` had a private copy of this helper; it now imports the shared one. Its
  `DIRECT_TIMEOUT_MS`/`RELAY_TIMEOUT_MS` values and user-facing relay message are unchanged, and
  `isCancellation` also accepts `FetchTimeoutError`.
- Chosen budgets: default 8 s for wake/verify/SSDP/Xbox/Chromecast/Broadlink send; 30 s for PS5
  and Apple TV (they drive a slow subprocess on the Pi); 60 s (`LEARN_TIMEOUT_MS`) for Broadlink
  learn, which legitimately waits for a person to press a physical remote button; 10 s
  (`HANDSHAKE_TIMEOUT_MS`) for the whole VNC handshake, which closes the socket on expiry.
- Tests (jest fake timers) prove each changed call now rejects: `fetchWithTimeout.test.ts`,
  `driverCallTimeouts.test.ts` (wake, Xbox, PS5, Apple TV, Chromecast, Broadlink send + learn),
  plus additions to `familyCommandCenterConfig.test.ts`, `SsdpDiscoveryProvider.test.ts`, and
  `RfbClient.test.ts`. No existing test was weakened.

## Audited and deliberately left alone (already bounded)

- **Sony, Roku, Denon, Yamaha, Sonos, Hue, squirrel feeder**: every request goes through
  `requestWithRelayFallback` (4 s direct, 8 s relay).
- **LG, Samsung sockets**: `openSocketWithRelayFallback` bounds the open (4 s / 8 s); LG has
  `CONNECT_TIMEOUT_MS` and `CALL_TIMEOUT_MS`; Samsung's `connect()` has `CONNECT_TIMEOUT_MS`.
- **Kasa, SmartThings**: already have their own `AbortController` + `FCC_REQUEST_TIMEOUT_MS`
  (8 s) with a typed error. Left as is to avoid changing their error type; a later cleanup could
  move them onto the shared helper.
- **FamilyCommandCenterDiscoveryProvider, familyCommandCenterDeviceLookup**: already bounded
  (`SCAN_TIMEOUT_MS`, `LOOKUP_TIMEOUT_MS`) with their own messages.
- **SsdpDiscoveryProvider native scan**: the UDP `bind` callback and the scan-window wait are
  bounded by the fixed scan window and the caller's abort; a UDP bind that never calls back is
  theoretical and not changed.
- **Timers-only promises** (`sendDigitSequence`, `sendCharacterSequence`, simulated latency):
  no network involved.

## Consequences

- A hung Family Command Center or device now surfaces a retry-able error within a bounded time
  on every path, so reconnect loops keep making progress.
- Future network calls should use `fetchWithTimeout` (or `withTimeout` for sockets); a bare
  `fetch()` in driver code is a review failure.
