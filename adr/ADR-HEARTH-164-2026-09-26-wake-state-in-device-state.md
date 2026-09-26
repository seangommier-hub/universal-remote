# ADR-HEARTH-164: Wake-burst activity published in DeviceState.values.waking

**Date:** 2026-09-26
**Status:** Accepted. Closes the "wakeBurstActive" gap listed in ADR-HEARTH-163.

## Context
"Waking up (this can take a minute)" never appeared because `WakeBurstController.isActive` is private to each driver
and the UI only sees `DeviceState` (ADR-163 passed `wakeBurstActive: false`).

## Decision
- The value lives in the existing loose bag, `DeviceState.values.waking: boolean` (key `WAKING_VALUE_KEY`), not a new
  top-level field, consistent with `playbackState` and every other per-capability value (see DeviceState.ts).
- `WakeBurstController` takes an optional `onActivityChange(deviceId, active)` listener. It fires `true` when a burst
  starts, and `false` when it ends by the device answering, by exhausting its window, or by `stop()`. A restart of a
  running burst does not emit a false-then-true blip. `stop()` with no burst running emits nothing.
- `withWaking(state, active)` (in `wakeBurst.ts`) returns a state copy with the flag set that keeps the existing
  `connection` (a missing state becomes "disconnected"). LG, Samsung and Sony each construct their controller with a
  listener that calls `setState(withWaking(...))`, so subscribers (StateStore) are notified. LG's `patchValues` was not
  reused because it forces `connection: "connected"`.
- UI: `UniversalTvRemote.tsx` (connection pill) and `DeviceConnectionStatus.tsx` pass
  `wakeBurstActive: state.values.waking === true`. The pill is unchanged in structure (one line), so remote height is
  unchanged.
- `lastError`: the remote already passes its `reconnectError` (ADR-163); device rows still have none. The runtime does
  not keep a per-device last error, and adding one was not cheap, so it is deliberately left out.

## Consequences
- Any driver adopting `WakeBurstController` should pass the same listener; otherwise "Waking up" cannot show for it.
- A connected device may carry `waking: false`; consumers must only test for `=== true`.

## Verification
Tests: `wakeBurst.test.ts` (listener true/false on answer, exhaustion, stop, restart), and LG, Sony and Samsung driver
tests assert `values.waking` true after powerOn/power, false after connect, exhaustion and disconnect.
`tsc --noEmit` clean. In the full jest run only `runner/shims/shims.test.ts` (local WebSocket server test) fails;
it is outside the touched code.
