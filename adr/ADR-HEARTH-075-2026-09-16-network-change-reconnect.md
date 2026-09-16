# ADR-HEARTH-075: Proactive reconnect on network change, not just app-foreground

**Date:** 2026-09-16
**Status:** Accepted, implemented; not yet live-verified against real hardware

## Context

Third item from the same-day three-agent research pass (ADR-HEARTH-073/074). One research report
found the single most common, most concrete complaint across reviews of competing universal-remote
apps: connection loss requiring a manual app restart — e.g. "The app loses its connection every
time the phone goes to sleep... You have to either force quit the app and restart it" (real app
store review of "TV Remote - Universal Control," cited by that research agent). This is directly
in line with Sean's own standing ask (2026-09-09, ADR-HEARTH-017): "make sure that nothing ever
gets unconnected like a device on wifi."

## What was already covered, and what the real remaining gap is

App.tsx already had two layers of resilience: each driver's own reactive backoff loop
(ADR-HEARTH-017 — retries after a failed command/socket-close, exponential 2s→30s) and an
`AppState` listener that reconnects every known device the instant the app returns to the
foreground from background/inactive. Read directly (not assumed) before building anything: neither
covers a real network drop/handoff that happens while the app STAYS in the foreground the whole
time — the user is actively looking at the remote screen when Wi-Fi drops and comes back, or the
phone hands off between Wi-Fi and cellular. Nothing proactively notices until the user's next
button press fails once and the reactive backoff eventually kicks in.

## Decision

Added `expo-network` (confirmed Expo-Go-compatible directly from its own SDK 57 source —
`platforms: ['android', 'ios', 'web', 'tvos', 'expo-go']` in its docs frontmatter, and a real
`addNetworkStateListener()` event API, not just a one-shot poll). A new `useEffect` in `App.tsx`,
the same shape as the existing `AppState` listener, subscribes and triggers
`reconnectAllDevices()` whenever `shouldReconnectOnNetworkChange()`
(`networkReconnectPolicy.ts`, a pure, directly-unit-tested function — same split as
`useDpadSwipeGesture.ts`'s tested predicates vs. its own wiring) says the transition warrants one:
connectivity was lost and just came back, or the connection type changed (e.g. Wi-Fi → cellular)
even if `isConnected` never reported false in between.

**Honest limit, documented rather than glossed over**: `expo-network`'s `NetworkState` has no
SSID/network-identity field in Expo Go (confirmed against the package's own source) — a silent
same-type roam to a different Wi-Fi access point, with connectivity never reported as lost, is
indistinguishable from no change at all. This is a real, meaningful improvement over "nothing
proactive at all," not a claim of perfect Wi-Fi-roam detection.

## Verification

6 new tests (`networkReconnectPolicy.test.ts`) cover: no reconnect on the first reading, reconnect
on lost→regained connectivity, no reconnect while staying disconnected or staying on the same
type, reconnect on a type change while connected, and no reconnect on a type change while newly
disconnected. Full suite: 33 suites / 332 tests pass, `tsc --noEmit` clean.

**Not live-verified against a real network drop/handoff** — no physical device was available this
session to actually toggle Wi-Fi/cellular and observe the reconnect firing.

## Consequences

- A household actively using Hearth during a real Wi-Fi blip or Wi-Fi↔cellular handoff gets an
  immediate reconnect attempt instead of waiting for the next failed command to start the reactive
  backoff loop.
- Same-network silent roaming (no connectivity gap, no type change) remains undetected — a real,
  named limit of what Expo Go exposes, not a bug in this implementation.
- Closes out the third and final item from ADR-HEARTH-073's research pass that was flagged as
  "worth verifying" rather than confirmed broken — investigated directly (reading `App.tsx`'s
  actual reconnect logic) before concluding there was a real gap worth fixing.
