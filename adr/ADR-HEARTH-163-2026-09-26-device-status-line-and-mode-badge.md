# ADR-HEARTH-163: Device status line and Home/Away badge

**Date:** 2026-09-26
**Status:** Accepted. Implements ADR-HEARTH-162 items 1 and 3.

## Context
A device that is off, asleep, or only reachable through the relay all showed the same bare "Disconnected" or
"Unknown", the dead-end "No Response" pattern that Apple Home is criticised for (ADR-162). Hearth always retries in the
background (ADR-017, ADR-144), so the UI should say so.

## Decision
- `src/ui/describeDeviceStatus.ts`: a pure function mapping {connection, knownPower, wakeBurstActive, lastError,
  connectivityMode, fccReachable, secondsSinceLastSeen} to ONE short line. Precedence when not connected: wake burst,
  away (relay only / relay silent), unreachable-style error ("Can't reach it — plugged in and on Wi-Fi? Retrying"),
  other error (quoted, truncated to 40 chars), unknown ("Connecting…"), else "Not connected — retrying automatically"
  plus "last seen". Every not-connected line says Hearth is retrying. Connected reads "Connected" (adds age only when
  stale over 5 min), kept short so the remote's pill row does not wrap.
- Device rows (`DeviceConnectionStatus.tsx`, extracted from `DeviceListScreen.tsx`) and the remote's existing
  connection pill show the line. The pill is one line (`numberOfLines={1}`, `flexShrink`), so remote height is
  unchanged.
- `ConnectivityBadge.tsx`: "Home" / "Away" beside the title in the Devices header, from `useConnectivityMode()`;
  renders nothing while the mode is "unknown".

## Known gaps (inputs not wired yet)
- `wakeBurstActive` is passed as false: `WakeBurstController.isActive` is private to each driver and not exposed to the
  UI. Wiring it (e.g. a `wakeBurstActive` flag in DeviceState) is the follow-up that makes "Waking up" appear.
- `lastError` is only known on the remote (from its manual reconnect); rows have none, so they show the generic or
  relay lines.
- `fccReachable` is inferred: any known mode (home or away) means the relay answered at least once; unknown means
  not known. It is not a live probe.

## Verification
`describeDeviceStatus.test.ts` covers every branch; `tsc --noEmit` clean; full jest suite passes. The web harness
(`scripts/ui-verify`) could not run here: `playwright` is not installed in this checkout's shared `node_modules`
and installing it needs a Chromium download. Run `node scripts/ui-verify/run.mjs` before shipping to confirm the
remote fit checks.
