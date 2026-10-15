# ADR-HEARTH-227: Background reconnect tries Wake-on-LAN automatically, not just the Power button

## Status

Accepted

## Context

Sean, directly (2026-10-15): "the app is not connecting to the devices." Live investigation traced
it to several unrelated causes at once (an expired Amazon sign-in for the smart plugs, a Roku
genuinely off the network for 10 days), but the Downstairs LG and Den Sony TVs were the real puzzle:
both answered neither ping nor their TV-control port, yet a manual Wake-on-LAN packet sent from the
Pi brought each back within seconds, and the TV's saved pairing still worked perfectly once awake
(238ms to register, no re-pairing needed). The TV was never broken — it was in low-power network
standby, and nothing in the app ever tried to wake it on its own.

Tracing why: `executeWakeOnLan` (every TV driver's handler for the explicit Power On button) is the
*only* place that resolves a device's MAC and sends a real Wake-on-LAN packet. The background
reconnect loop (`scheduleReconnect`, running continuously whenever a TV is unreachable) only ever
retries the same SSAP/IP-control connection on exponential backoff — which a sleeping TV will never
answer, no matter how many times or how patiently it's retried. The fast post-wake retry burst
(`WakeBurstController`, ADR-HEARTH-144) already existed and was already wired into each driver, but
only ever got *started* from that same explicit-button path, never from a plain failed reconnect.

## Decision

New shared helper, `src/drivers/shared/autoWakeOnReconnect.ts`'s `tryAutoWakeOnLan(device)` — the
exact MAC-resolution logic `executeWakeOnLan` already had (saved `hwaddr`, falling back to a Family
Command Center lookup by IP for a device paired before hwaddr-saving existed), reused rather than
duplicated a fourth time. Never throws: no resolvable MAC, or a failed send, just means no
automatic wake this time, and the caller's normal reconnect behavior is unaffected.

Each of `LgWebOsDriver`, `SonyBraviaDriver`, `SamsungTizenDriver` now calls it from the one place
each already handles "reconnect just failed" (`connect()`'s catch for LG/Samsung, `refreshState`'s
catch for Sony — the exact site that already logged "Failed to reach ... TV"). On success, the
driver starts its existing wake burst instead of the plain backoff; on failure (no MAC known, or
the send itself failed), behavior is byte-for-byte unchanged from before this ADR.

**Guarded on `!this.wakeBursts.isActive(device.id)`** before trying — a running burst's own
internal reconnect attempts land in this exact same catch block, and retriggering mid-burst would
keep resetting `WakeBurstController` back to attempt 1 forever, so it could never reach its own
exhaustion fallback to the slow backoff.

## Consequences

- A TV that's merely asleep now wakes itself up the first time the background loop notices it's
  gone, the same as if someone had pressed Power On — no more needing to find and press that
  button, or needing me to send a WoL packet by hand, just to make a sleeping TV answer again.
- A genuinely off or unplugged TV behaves exactly as before: no resolvable MAC yet (first-ever
  pairing) falls straight through to the normal backoff; a MAC that *is* known gets one more
  harmless WoL packet per failure episode, which a truly unplugged TV simply never receives.
- Samsung's `client.onDisconnect` path (a TV dropping mid-use, not a failed reconnect) is left
  calling the plain `scheduleReconnect`, unchanged — same scope as LG's and Sony's own single call
  site, not broadened further.
- New tests: `autoWakeOnReconnect.test.ts` (4). Full suite: 2500 passed (4 new), `tsc` clean.
- Needs an EAS update to reach the phones.
