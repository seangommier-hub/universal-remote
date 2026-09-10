# ADR-HEARTH-020: Bridge driver state into the shared StateStore

**Date:** 2026-09-10
**Status:** Accepted

## Context

Found during a proactive review pass, prompted by re-checking `StateStore`
and `DeviceDriver` after several rounds of "keep working": every driver
(`LgWebOsDriver`, `SamsungTizenDriver`, `SonyBraviaDriver`,
`RokuEcpDriver`, `SimulatedTvDriver`) correctly implements
`getState(device)` and `subscribeToState(device, listener)` from the
`DeviceDriver` interface, and each is tested against its own internal
state/listener bookkeeping. But a grep across the entire app (`App.tsx`,
every `src/ui/*.tsx`, every `src/core/**/*.ts`, every `src/drivers/**/*.ts`)
turned up **zero callers of `subscribeToState` anywhere outside test
files.** It's implemented five times, tested five times, and never once
invoked by the running app.

`UniversalTvRemote` — the screen showing the "Connected"/"Not connected"
status pill and the reconnect banner — reads exclusively from the shared
`core/state/StateStore.ts` (`stateStore.get()` / `stateStore.subscribe()`),
a completely separate object from each driver's own internal state map.
The only thing that ever wrote into that shared store was
`CommandEngine.execute()`'s `stateStore.patch(device.id, result.state)`
after a *successful command* — and `patch()`'s `connection` parameter
defaults to `"connected"` when not passed, which `CommandEngine` never
passes. So the shared store had no path to ever learn about:
- A device actually connecting (`AddXDeviceScreen`, `App.tsx`'s
  `reconnectAllDevices`/`handleReconnect`, and every driver's own
  auto-reconnect timer all call `driver.connect()` directly — never
  through `CommandEngine`, never touching `stateStore`).
- A device unexpectedly disconnecting (the entire point of
  ADR-HEARTH-017's reconnect work — a driver's own
  `handleUnexpectedDisconnect` writes to its *internal* state, which
  nothing outside that driver ever reads).

Concretely, this meant: right after pairing a device successfully, its
remote screen would show "unknown"/disconnected (the shared store had
never been told about the fresh connection) — which itself would trigger
`UniversalTvRemote`'s own "reconnect on screen open" effect, firing a
*second*, entirely redundant `connect()` call for a device that was
already perfectly connected. And a real disconnect, mid-use, would leave
the status pill silently showing stale "Connected" from the last
successful button press, with the reconnect banner never appearing at
all — the exact silent-failure shape this session spent most of its
effort trying to eliminate elsewhere (ADR-HEARTH-016's command-error
banner, ADR-HEARTH-017's whole reconnect effort), just one layer further
out where nobody had looked yet.

## Decision

New `src/runtime/stateStoreBridge.ts`, one exported function:
`bridgeDeviceState(driver, device, stateStore)`. Subscribes to the
driver's `subscribeToState` first (so a state change landing between
subscribing and the initial read can't be missed), forwards every future
notification straight into `stateStore.set(deviceId, state)`, and
separately seeds the store once with the driver's current `getState()`
result. Returns the unsubscribe function.

`App.tsx` calls this once per device, tracked in a `stateBridges` Map
keyed by device id (so a device can't be double-bridged and a removed
device's listener doesn't leak):
- For every persisted device at startup, right after
  `deviceRegistry.add(device)`.
- In `handleDeviceAdded`, right after a freshly-paired device is added —
  by this point `AddXDeviceScreen` has already called `driver.connect()`
  successfully, so the seed read immediately reflects "connected", not a
  stale "unknown."
- Unsubscribed in `handleRemoveDevice` (ADR-HEARTH-019), alongside the
  driver disconnect and registry removal already happening there.

## Rationale

The fix is a bridge, not a rewrite of how drivers track state internally —
each driver's own `states`/`listeners` bookkeeping is correct and already
tested; the gap was purely that nothing connected it to what the UI reads.
A deeper refactor (drivers writing directly into an injected `StateStore`
instead of keeping their own copy) would remove the duplication entirely,
but touches all four drivers' constructors and every one of their existing
tests for a benefit `stateStoreBridge.ts` already delivers at a single,
well-contained choke point — not worth the larger diff right now.

## Consequences

- 100/100 tests passing (3 new, in `stateStoreBridge.test.ts`, covering:
  the initial seed, every subsequent driver state change propagating, and
  the unsubscribe function actually stopping propagation), `tsc --noEmit`
  clean.
- This should also reduce the frequency of the double-connect race
  ADR-HEARTH-017 fixed at the protocol level — `UniversalTvRemote`'s
  reconnect-on-screen-open effect will now see accurate state instead of
  near-permanently believing every freshly opened screen is disconnected.
  The in-flight-promise dedupe stays regardless, as genuine defense —
  this fix changes how *often* a redundant connect() is attempted, not
  whether one is still handled safely if it happens.
- Not yet verified on a real device — same outstanding caveat as
  everything else from this session's UI/reliability work. This one in
  particular is worth Sean specifically watching for: the status pill and
  reconnect banner reacting to a real disconnect/reconnect should now be
  visibly different from before.
