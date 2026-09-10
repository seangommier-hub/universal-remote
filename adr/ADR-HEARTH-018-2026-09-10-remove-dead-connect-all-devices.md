# ADR-HEARTH-018: Remove dead `connectAllDevices` / `HearthRuntime.devices`

**Date:** 2026-09-10
**Status:** Accepted

## Context

Found during a proactive review pass (same night's momentum as
ADR-HEARTH-016/017, continuing under Sean's "keep moving" directive):
`createHearthRuntime()` in `bootstrap.ts` set `devices: Device[]` to a
hardcoded empty array — a leftover from an earlier mock/seed-device phase
of this project. The function's own doc comment already said as much: "No
seed/mock devices... the app starts with an empty device list." Nothing
anywhere in the codebase ever pushed a value into that array.

`App.tsx`'s startup effect called `connectAllDevices(runtime)` on every
app launch, which iterated `runtime.devices.map(...)` — always mapping
over an empty array, so the call was a guaranteed no-op every single time,
before real device connection (`loadDevices()` + `reconnectAllDevices`)
even ran.

## Decision

Removed `connectAllDevices` from `bootstrap.ts` and the `devices` field
from the `HearthRuntime` interface entirely, rather than leaving it as
harmless-but-confusing dead code. `App.tsx`'s startup effect no longer
calls it; `useState<Device[]>(runtime.devices)` became
`useState<Device[]>([])`, which is exactly what it evaluated to anyway.

## Rationale

This is a plain dead-code removal, not a behavior change — confirmed by
grep that `runtime.devices` and `connectAllDevices` had no other callers
or writers anywhere in the codebase. Matches the standing instruction to
delete code confirmed unused rather than leave it commented out or
"just in case." A future reader tracing app startup would otherwise waste
time asking what real device population feeds that array, when the answer
is: none, ever.

## Consequences

- 97/97 tests passing (no test exercised this dead path — nothing to
  update), `tsc --noEmit` clean.
- No behavior change: startup connects devices via `loadDevices()` +
  `reconnectAllDevices()` exactly as before; the removed call never did
  anything observable.
- If a future "seed devices for a demo/onboarding" feature is wanted,
  it should be designed fresh against the current `DeviceRegistry`/
  persistence flow rather than reviving this field — it predates the
  reconnect/generation work in ADR-HEARTH-017 and doesn't account for it.
