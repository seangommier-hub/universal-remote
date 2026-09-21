# ADR-HEARTH-122: Fix LG connect hanging forever with no timeout on `call()`

**Date:** 2026-09-21
**Status:** Accepted, implemented

## Context

Sean, live: "why is the connection persistence not retaining... it also is no longer connecting to
the lg which is on and it doesn't turn the lg on when it's off... it seems to be trapped in a
reconnecting loop."

Investigated live rather than guessed, per this project's own standard. Checked
`hearth-relay-ws.service`'s real logs on the Pi:

```
07:58:12  connection attempt → wss://192.168.1.218:3001
07:58:17  connected to 192.168.1.218:3001 -- relaying     (SUCCESS)
```

...and nothing else for that TV in the 20+ minutes since, while Sean's app stayed stuck on
"Reconnecting...". Confirmed with Sean directly this is the main household LG, not the known
isolated-segment TV (Luca's, which *did* separately fail at 08:01 for the already-understood,
unrelated reason — no network route from the Pi to that segment).

A real retry loop, even at the capped 30s backoff, would show new connection attempts in that log
every ~30s. Zero new attempts for 20+ minutes means the app wasn't actually retrying — it was stuck
awaiting something that never settled.

## Root cause

`LgWebOsClient.call()` — used for every SSAP request after the initial register handshake
(`getVolume`, `getExternalInputList`, `listLaunchPoints`, etc.) — never had a timeout:

```ts
call(uri, payload = {}): Promise<Record<string, unknown>> {
  ...
  return new Promise((resolve, reject) => {
    this.pending.set(id, { resolve, reject });
    this.socket!.send(...);
  });  // nothing ever times this out
}
```

`connect()`'s own register handshake already has `CONNECT_TIMEOUT_MS` (30s, since a human has to
physically approve a first pairing) — `call()` was simply missed when that pattern was built.

`LgWebOsDriver.doConnect()` awaits `refreshVolumeState` → `refreshInputList` → `refreshApps`
sequentially right after a successful handshake, each calling `call()` internally. If this TV's
firmware ever silently drops a response to one specific request instead of sending an explicit
error — plausible for `listLaunchPoints` (ADR-HEARTH-078, one of the newer, less-travelled calls)
— that promise hangs forever. Each of those three helpers has its own try/catch, but a promise
that never settles never reaches either branch: `doConnect()` itself never resolves or rejects.

That stuck promise sits in the driver's `inFlightConnects` map permanently. `connect()`'s dedup
guard (`if (existing) return existing;`) means every later reconnect attempt — the Reconnect
button, the app-foreground listener, opening the remote screen — just re-awaits the same dead
promise instead of ever trying the network again. The UI's `reconnecting` state (set in
`handleReconnectPress`, cleared only in a `finally` after `await onReconnect()` settles) never
clears, reads as an endless spinner, and *feels* like a reconnect loop — but the relay logs prove
there was no loop at all, just one hung promise nothing could ever wake up.

## Decision

Added `CALL_TIMEOUT_MS = 8000` to `call()` — 8 seconds is generous headroom for hardware (a normal
SSAP request answers in well under a second) while guaranteeing the promise always settles one way
or another. On timeout: removes the pending entry and rejects with a clear message naming the URI
that hung. Every caller already handles a rejection correctly (their own try/catch, or
`executeCommand`'s normal error surface) — this fix is purely "make sure the promise settles,"
nothing else needed to change.

## Testing

3 new tests in `LgWebOsClient.test.ts`: rejects with a clear message when nothing ever responds;
a late response arriving after the timeout already fired is silently ignored rather than crashing
(`handleMessage` looks up an id no longer in `pending`, finds nothing, same as any unrecognized
message); a real response just under the timeout still resolves normally, confirming this doesn't
regress the happy path. `npx tsc --noEmit` clean; full suite 942/942 passing.

## Consequences

- Fixes the reported symptom directly: a hung request now surfaces as a normal failure within 8s,
  `doConnect()` properly rejects, `connect()`'s existing `scheduleReconnect()` backoff takes over
  exactly as designed, and the UI's reconnect spinner correctly clears (with an error shown) instead
  of hanging forever.
- This was a real, pre-existing gap, not something introduced this session — flagged honestly
  rather than treated as new. It likely didn't surface earlier because most SSAP requests on this
  TV do respond reliably; `listLaunchPoints` (2026-09-19) is one of the more recently added calls
  and a plausible trigger, though the exact request that hung on Sean's TV isn't confirmed from log
  evidence alone.
- Not yet live-verified against a real recurrence — the real test is whether this class of hang
  stops happening in practice, which only shows up over time on real hardware.
