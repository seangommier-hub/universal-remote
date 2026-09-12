# ADR-HEARTH-045: Restore an Expo Go testing path via `--go`, alongside the stalled dev-client build

Date: 2026-09-12

## Status

Accepted.

## Context

Sean: "and fix expogo in the mean time" — while the Pi-based SideSign sideload
path ([[ADR-HEARTH-044]]) is still blocked on Apple-side authentication
errors (`HTTP 434` then `-22413`), he wants a working test loop on his phone
tonight rather than nothing.

Since ADR-HEARTH-013 added `expo-dev-client` to the project (needed for the
LG/Samsung raw-TLS work), a plain `npm start` / `expo start` serves a
dev-client-only QR code that the stock Expo Go app on Sean's phone cannot
open — this is expected Expo behavior once `expo-dev-client` is a
dependency, not a bug. No custom dev-client `.ipa` has ever been
successfully installed (that's the whole SideSign saga), so until tonight
there was no way to run the app on the phone at all.

## Decision

Added `"start:go": "expo start --go"` to `package.json`. Expo's `--go` flag
forces the dev server back into legacy-Expo-Go compatibility mode
regardless of `expo-dev-client` being installed, with no code or dependency
changes. Sean's existing Expo Go app (confirmed SDK 57-compatible in
ADR-HEARTH-003) can scan this QR and run the app immediately.

## Consequences

- Everything that worked under Expo Go before the Phase 3 transition still
  works: Sony, Roku, FCC discovery/relay, camera QR pairing.
- LG and Samsung device control will not work in this mode — Expo Go's JS
  engine still can't do the custom TLS trust-anchor those need (the original
  reason for ADR-HEARTH-013's transition). This is a known, accepted gap,
  not a regression to chase.
- This is a parallel testing path, not a replacement for the dev-client/
  sideload effort — it doesn't touch or resolve [[ADR-HEARTH-044]]'s Apple
  auth blocker at all. Once a signed dev-client build actually installs,
  `npm start` (dev-client mode) becomes the primary path again for full
  feature coverage.
- No new risk surface: `--go` is a stock Expo CLI flag, not a workaround or
  patch.

## Related

ADR-HEARTH-013, ADR-HEARTH-003, [[ADR-HEARTH-044]]
