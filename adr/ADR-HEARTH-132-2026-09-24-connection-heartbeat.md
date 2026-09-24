# ADR-HEARTH-132: Heartbeat so a silently dead connection reconnects by itself

**Date:** 2026-09-24
**Status:** Accepted, implemented for LG; not yet verified against a real TV drop

## Context

Sean: "fix the connection process ... maintaining connection to devices and not having to
reconnect." Every driver already reconnects with backoff when it *knows* the link is gone, and the
app re-checks on foreground and network change. The remaining hole: a persistent socket (LG) that
loses its peer without a clean close (Wi-Fi handoff, TV dropping off overnight) never fires
`onclose`, so the driver kept reporting "connected" until a button press hung and failed.

## Decision

`src/drivers/shared/connectionHeartbeat.ts`: every 20 seconds run a cheap real request over the live
connection; two consecutive failures declare it dead. `LgWebOsDriver` uses
`ssap://audio/getVolume` (already used at connect) and on death closes the client and runs its
existing disconnect handler, so the normal backoff reconnect takes over within about a minute
instead of waiting for a user's failed press. Stopped on deliberate disconnect.

Not applied to: per-request drivers (Sony, Roku, Denon, Yamaha, Chromecast, Sonos, Apple TV, Kasa),
which hold no socket and already learn state on each request; Samsung's socket, which has no
side-effect-free query to probe with (left as a follow-up rather than guessing at one).

## Consequences

- One small timer per connected LG; cleared on disconnect. Tests use `afterEach`/`finally` to
  disconnect so no timers leak.
- Detection latency is up to ~60 seconds (two 20s probes plus the 8s call timeout).
