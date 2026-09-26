# ADR-HEARTH-171: Contract-suite bug fixes and exemption cleanup

**Date:** 2026-09-26
**Status:** Accepted (built). Implements ADR-HEARTH-158 item 5; closes the real-bug list of ADR-HEARTH-145 (#1, #4, #8, #9, #10, #11, #12).

## Context

The driver contract suite (ADR-145) parked real defects as `test.failing` markers. This clears them all.

## Decisions

1. **Relay-only memory expires (#1).** `httpRelayFallback` remembered "this address needs the relay" for the whole
   session after any direct failure. It is now a `Map<key, expiresAt>` with `RELAY_ONLY_TTL_MS = 45_000`. The lag protection
   for genuinely unreachable segments stays (one direct probe per 45 s), but a device that blipped, or a phone that rejoined
   the LAN, recovers with no relay configured. Rationale: 45 s is longer than a rapid burst of button presses yet short
   enough that a human notices recovery. Tests: `relayRecovery.test.ts` (skip inside the window, direct retry after it).
2. **SwitchBot requests are bounded (#4).** `SwitchBotClient` uses `fetchWithTimeout` with a 10 s ceiling (cloud API, slightly
   more than the 8 s LAN default).
3. **Failed commands mark the driver disconnected and start the backoff loop (#10)** for Sony, Denon, Yamaha, Sonos and
   Chromecast, matching Roku/Kasa/Apple TV. New `shared/commandFailure.ts`: `CommandValidationError` (bad argument or
   unsupported capability, never evidence of a dead device) and `runCommandTrackingReachability`. Sony marks only genuine
   reachability failures (an API-level rejection means the TV answered) and marks before the Wake-on-LAN fallback.
   A command failing after `disconnect()` (generation changed) does not resurrect a retry loop.
4. **SmartThings (#11, #12):** in-flight connect dedupe, a backoff+jitter reconnect loop, generation guard against
   disconnect, and failed commands start the loop too. Hue and the feeder get connect dedupe only; their "stateless, no
   retry loop" stance (ADR-032/104) stays a by-design exemption. New `shared/inFlightDedupe.ts`.
5. **LG and Samsung (#8, #9):** a failed connect now reports "disconnected" (was "unknown"), and skips the retry loop when
   `disconnect()` landed during the attempt (generation check), removing the zombie reconnect.
6. **Connect timeouts audit:** every driver whose connect does network I/O passes `connectHangRejects` in the contract
   (bounded rejection under a black-holed network); no exemption for it remains except the by-design no-probe drivers.

## Exemptions remaining (all by-design, none are bugs)

- Xbox, PS5, Broadlink: connect() does no network I/O and command failure does not change state (ADR-064/099/103).
- Hue, squirrel feeder: no retry-after-failure loop, stateless HTTP (ADR-032/104).
- Samsung: no documented liveness probe; LG: socket health owned by onclose plus heartbeat (ADR-143/132).
