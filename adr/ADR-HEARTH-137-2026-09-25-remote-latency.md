# ADR-HEARTH-137: Cut the delay between a tap and the TV reacting

**Date:** 2026-09-25
**Status:** Accepted, implemented; Pi-side fix measured, phone-side fix unit-tested only

## Context

Sean: the app has a "delay in remote vs. infrared or a typical remote."

Measured, not guessed: for LG/Samsung (and Sony/Roku through the HTTP relay) the phone reaches the TV
through Family Command Center's relay. Opening a relayed connection took 1.8-2.2s whenever the Pi's
5-second known-device cache had lapsed, versus 0.27s warm, because that check does a ~4s Pi-hole and
router lookup. It hit every connect, every reconnect and LG's button socket after an idle close.
Separately, each new WebSocket first tried a direct connection (4s timeout) that always fails for
devices only reachable via the relay.

## Decision

1. **Pi (Family Command Center adr/0187, deployed and measured):** a device already in the last known
   set is authorized immediately and the set refreshes in the background; unknown targets still wait
   for a fresh check. Cold connection time went from about 2s to about 0.25s.
2. **Phone (`wsRelayFallback.ts`):** once the relay has succeeded for a device, later connections
   skip the direct attempt for 10 minutes, then try direct again. Recorded only after the relay works,
   so a device with no relay configured still gets its direct attempt every time.
3. Tried and dropped: pre-opening LG's button socket right after connect. It changed the message
   order the driver relies on, and step 1 already makes opening it about 0.3s.

## Consequences

- Taps on an already-open connection were already fast (one message); the gain is on the first tap after
  a connect, reconnect or idle drop, which is when it felt slow.
- A device removed from the network stays authorized for at most one refresh cycle.
- Not measured on a phone; the remaining per-tap cost is the phone-to-Pi-to-TV hop (tens of ms on the LAN).
