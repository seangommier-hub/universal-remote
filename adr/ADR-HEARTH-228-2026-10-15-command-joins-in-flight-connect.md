# ADR-HEARTH-228: A command joins an already in-flight connect() instead of failing outright

## Status

Accepted

## Context

Sean, directly (2026-10-15), right after ADR-HEARTH-227 shipped: "it turned it on then i got a
call connect before sending commands error." He had tapped Power On for the LG in the app, it woke
the TV, and a command sent shortly after failed with `Device ... is not connected — call connect()
before sending commands`.

Root cause: `LgWebOsDriver`/`SamsungTizenDriver`'s `executeCommand` requires `this.clients.get
(device.id)` to already be set *at the instant* the command runs — there was no allowance for a
connect() already in progress. The remote screen's own `controlsDisabled` gate (`!isConnected`,
`deriveRemoteViewState.ts`) only clears once `state.connection` flips to `"connected"`, which
happens a beat *after* the driver's own `this.clients` map is actually populated inside `doConnect`
— and the explicit Power On button is deliberately never disabled while reconnecting (ADR-HEARTH-102:
it has to work with no client present at all). That combination makes a command land in the narrow
window where a connect is genuinely progressing and about to succeed, but the client isn't set yet
— previously a hard, user-visible failure for a command that would have gone through a moment later.

## Decision

Both drivers' `executeCommand` now check `this.inFlightConnects` (the same map `connect()` already
uses to dedupe concurrent calls) before giving up: if no client exists yet but a connect is already
running for this device, it joins that promise (swallowing its own failure — already logged by
`connect()`'s own catch) and re-checks for the client once more before throwing. A device with no
connect in flight at all — genuinely never connected, or one that already finished and failed —
still fails immediately, byte-for-byte as before.

Sony is unaffected: it has no persistent client or this race at all (a fresh `SonyBraviaClient` per
command, over plain HTTP, no `this.clients` map to race against).

## Consequences

- A button pressed right after waking a TV (or any other connect-in-progress moment) now succeeds
  once the connect finishes, instead of failing with a confusing error for something that was
  about to work anyway.
- A command sent to a device that's never been paired, or one background-retrying after a real
  failure with nothing currently in flight, still fails exactly as before — this only closes the
  narrow in-progress-connect window, nothing else.
- New tests: `LgWebOsDriver.test.ts` (+2), `SamsungTizenDriver.test.ts` (+1). Full suite: 2503
  passed (3 new), `tsc` clean.
- Needs an EAS update to reach the phones.
