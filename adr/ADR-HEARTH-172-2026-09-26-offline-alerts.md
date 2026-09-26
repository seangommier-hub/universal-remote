# ADR-HEARTH-172: Calm offline alerts for silent failures

**Date:** 2026-09-26
**Status:** Accepted (built). Implements ADR-HEARTH-162 item 4 (app half). Pi half: Family Command Center `adr/0200`.

## Context
Hearth retries quietly forever (ADR-HEARTH-163, and the "remote should feel natural" rule), so a dead Pi relay or a TV that
silently dropped off looked like nothing at all until someone tapped it. ADR-162 asked for alerts on silent failure.

## Decisions
1. **One calm banner at the top of the Devices tab** (`OfflineAlertBanner`, above the update banner). Never a modal, never
   sound. Two kinds, one at a time, relay first: "Family Command Center isn't answering — remote-from-anywhere is off;
   retrying" (Retry, dismiss) and "<Device> hasn't answered for N min" (Wake if the device has `powerOn`, Retry = reconnect,
   dismiss). It collapses by itself when healthy.
2. **Relay signal** (`core/network/fccOutage.ts`): `fccFetch` records "reached" on any HTTP response and "unreachable" when
   neither LAN nor tunnel answers. It counts as an outage only when failures span 60 s, and is ignored if the last failure
   is older than 3 min. A single failure or a normal short reconnect never shows a banner.
3. **Device signal** (`core/network/deviceOutageTracker.ts`): only a device that was connected earlier this session counts
   (opening the app while the TV is off is not an alert), silent for more than 2 min, and a wake burst in progress pauses
   the clock. Longest silence wins when several qualify.
4. **Dismissal** hides that alert until its problem clears; if it clears and returns, it shows again.
5. **Health probe:** while the Devices tab is open and a Pi is configured, the app calls `GET /api/integrations/hearth/health`
   once a minute (`familyCommandCenterHealth.ts`) so a dead relay is noticed even when nothing else talks to the Pi. The
   answer body is not used by the app yet; only reachability matters.
6. **No push notifications:** they need a native build and would not reach both phones over the shared OTA channel (rule
   from ADR-162 item 8 is deferred). This is in-app only.
7. **Demo/web harness:** `?demo=1&offline=fcc|device` (`demo/demoOffline.ts`) drives the real detection code with a shortened
   wait; harness scenarios `offline-banner-fcc`, `offline-banner-device`, `offline-banner-dismissed`.

## Known limits
- Detection only runs while the Devices tab is mounted; nothing alerts with the app closed.
- Health probe and relay banner have not been exercised against the live Pi from a phone, only unit tests and the web harness.
