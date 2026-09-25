# ADR-HEARTH-140: A per-device Share switch decides what a bump or sync sends

**Date:** 2026-09-25
**Status:** Accepted, implemented and unit-tested; not yet used on two phones

## Context

Sean, after getting Leah connected: households should be able to have "certain devices synced to phones
or tablets if bumped." Until now every device on a phone went out on a bump, on "Share mine", and through
the automatic household sync (ADR-HEARTH-129/130/131), pairing keys included.

## Question asked (ADR-GLOBAL-002)

Per-device Share switch, a tick-list at bump time, or both. Sean: **per-device Share switch.**

## Decision

- `Device.shared?: boolean`. Undefined counts as shared, so the devices already on Sean's phone keep
  syncing. A device newly added on a phone starts `false` (private). A device received from another
  phone is marked `true`, so it keeps syncing onward.
- Only shared devices leave the phone: the automatic sync, "Share mine" and bump all use
  `selectSharedDevices`. Import is unchanged and never overwrites a local device.
- The Family Command Center settings screen lists every device with a Share switch above the Share,
  Load and Bump controls.

## Consequences

- Switching a device off stops it being sent from this phone but does not pull it off phones or the
  household list that already have it; "Share mine" replaces the list with this phone's shared devices.
- The switch lives in Family Command Center settings for now; no per-device switch on the remote screen.
- Tablets work the same way: any Hearth install with the household's Family Command Center saved.
