# ADR-HEARTH-138: Returning to the app no longer drops healthy device connections

**Date:** 2026-09-25
**Status:** Accepted, implemented and unit-tested; not yet observed on a phone

## Context

Sean: "keep working on connections for other devices," after "app is no longer connecting to devices
consistently." The Pi's relay log for the LG showed the phone closing and reopening its LG connection
every time the app came back to the foreground, each taking several seconds to come back. Cause: on
every return to the app, on a network change, and at startup, `reconnectAllDevices` called `connect()`
on every device, and LG's `connect()` builds a brand new socket and closes the old one, even when the
old one was perfectly healthy. That is what "not connecting consistently" looked like.

## Decision

- New optional driver method `isConnectionAlive(device)`: cheap proof that the existing connection
  works right now. `LgWebOsDriver` implements it (no client: false; otherwise `audio/getVolume` must
  answer within 3s).
- `reconnectAllDevices` moved out of `App.tsx` into `src/runtime/reconnectAllDevices.ts` (tested) and
  skips any device whose driver proves it alive; every other device reconnects as before. A dead
  connection is still caught by the LG heartbeat (ADR-HEARTH-132) and by the probe here.
- Not done: Samsung's persistent socket has the same churn but no known side-effect-free query to
  probe with and no Samsung TV in this household to verify against, so it keeps reconnecting.
  Per-request drivers (Sony, Roku, Denon, Yamaha, Chromecast, Sonos, Apple TV, Kasa) hold no socket;
  their `connect()` is one light request and stays as is.

## Consequences

- A returning app leaves a working LG alone instead of interrupting it for several seconds.
- A connection that died while the phone was locked costs the 3s probe before it is rebuilt.
