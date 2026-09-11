# ADR-HEARTH-039: Live connection status on the device list

Date: 2026-09-10

## Status

Accepted.

## Context

While troubleshooting a live "why is it not connecting" report for Sean's
LG TV, extensive server-side investigation (direct TV reachability,
Family Command Center health, full reconnect-chain code review) turned
up no bug — everything checked out correct. What DID turn up: the device
list screen (`DeviceListScreen.tsx`) never showed any connection status
at all. Every device tile looked identical whether connected,
disconnected, or mid-reconnect. The only place connection state was ever
visible was on a device's own remote screen (`UniversalTvRemote.tsx`'s
header dot) — and even there, a fresh reconnect attempt can take up to
~40 seconds to resolve (4s direct + 8s relay fallback + up to 30s
awaiting a TV pairing response), so a user checking and leaving early
sees "Not connected" with no error yet, indistinguishable from something
actually being broken.

This gap plausibly explains at least part of why the same report kept
recurring even after real fixes landed: there was no way to see progress
or status from the one screen most likely to be glanced at.

## Decision

`DeviceListScreen` now takes a `stateStore: StateStore` prop and each
row independently subscribes to its own device's live connection state
via a small `ConnectionStatus` sub-component — a colored dot
(`theme.statusOn` / `statusError` / `statusOff` for connected/
disconnected/unknown) plus a text label, reusing the identical
color-coding `UniversalTvRemote`'s own header dot already established.
Subscribing per-row (not at the list level) means one device's state
change re-renders only that row, not the whole `FlatList`.

## Consequences

- 190/190 tests passing (no new tests — this codebase has no RN
  component-rendering test coverage anywhere, consistent with every
  other UI-only change tonight), `tsc --noEmit` clean.
- Does not fix any underlying connectivity issue — it makes whatever the
  real state is honestly visible without requiring a tap-and-wait, which
  is valuable independent of whatever tonight's actual root cause turns
  out to be.
- Not yet visually confirmed on Sean's phone.
