# ADR-HEARTH-113: Universal sleep timer for any device with a power-off mechanism

**Date:** 2026-09-20
**Status:** Accepted, implemented

## Context

Sean, directly: "also, there should be a method for a sleep function on any tv to be easily
activated." Only Samsung declares a real native `sleepTimer` capability (`KEY_SLEEP`, cycling the
TV's own on-screen presets) — every other brand's public API/protocol genuinely has no equivalent
command (see `Capability.ts`'s own research note). Every other device does, however, have some way
to turn itself off (`power`, `powerOff`, or the `powerOn`/`powerOff` pair from ADR-HEARTH-102/112),
which is enough to build an equivalent feature without needing brand cooperation.

## Decision

Built a plain, non-persisted, per-device countdown in
[sleepTimerManager.ts](../src/runtime/sleepTimerManager.ts)
(`startSleepTimer`/`cancelSleepTimer`/`getSleepTimerExpiration`/`subscribeSleepTimer`) — a
client-side `setTimeout` keyed by device id, replacing rather than stacking on a second call for
the same device. Deliberately **not** persisted across an app relaunch/kill, the same honest scope
as this project's other non-persisted timers (e.g. LG/Samsung's own reconnect backoff) — surviving
a backgrounded-but-not-killed app (the real, common case: falling asleep with the phone screen off
nearby) is covered; surviving a full app kill would need a real scheduled local notification, a
materially bigger feature not built here.

Wired into `UniversalTvRemote.tsx`'s utility row alongside (not replacing) Samsung's native
button: `hasNativeSleepTimer = has(device, "sleepTimer")` keeps that exact existing behavior
unchanged; `canUniversalSleep = !hasNativeSleepTimer && (has(device,"power") ||
has(device,"powerOff"))` gates a second, universal "Sleep" button on everything else. Tapping it
opens a duration picker (15/30/45/60 minutes, matching Samsung's own native presets) reusing the
same modal styling `DeviceListScreen.tsx` already established; while a timer is running the button
shows filled/active and re-tapping shows "Cancel sleep (Nm left)" instead of the picker. On
expiry, `sendUniversalSleepPowerOff()` sends `powerOff` if the device has it, else `power` —
same preference order the consolidated power button (ADR-HEARTH-112) already uses.

## Consequences

- No behavior change to Samsung's existing native sleep timer.
- Every device with `power` or `powerOff` (i.e. nearly every driver in this app) now gets an
  equivalent "easily activated" sleep function, per Sean's request — without needing any
  brand-specific protocol support.
- Devices with neither `sleepTimer` nor any power-off mechanism (none currently registered, but
  possible for a future read-only driver) simply show no Sleep button at all — an honest omission,
  not a broken one.
- The timer is purely client-side app state: killing the Hearth app cancels any in-flight sleep
  countdown. Disclosed above; acceptable for this feature's real use case.
- `npx tsc --noEmit` clean; `npx jest --silent` 919/919 passing, including
  [sleepTimerManager.test.ts](../src/runtime/sleepTimerManager.test.ts)'s 6 new tests (elapse
  firing, expiration reporting/clearing, cancellation, replace-not-stack, per-device independence,
  subscriber notification).
