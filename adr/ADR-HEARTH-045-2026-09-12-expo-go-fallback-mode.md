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

## Update 2026-09-12 (later, different session): the LG/Samsung consequence above is very likely stale — correcting, not reversing

While investigating a separate report ("the ability to connect to other devices" is broken —
[[ADR-HEARTH-047]]), re-derived this ADR's own claim that "LG and Samsung device control will not
work in this mode" against the actual current connect path rather than taking it as settled, since
it's a specific, checkable technical claim, not a decision.

**The claim as written describes the pre-[[ADR-HEARTH-014]] state, not today's.** ADR-HEARTH-013
did establish that React Native's WebSocket can't trust LG's private-CA certificate — true, and
still true. But ADR-HEARTH-014 (the very next day) solved that specific problem a different way:
`LgWebOsClient` never asks the *phone* to trust that certificate at all. It connects through
`openSocketWithRelayFallback` (`src/core/network/wsRelayFallback.ts`), whose fallback leg is a
plain, unencrypted `ws://` connection from the phone to Family Command Center's relay — ordinary
`WebSocket` usage, nothing Expo Go restricts. The relay's own outbound leg, where the actual
`wss://`-to-the-TV connection happens, runs in the Pi's Node.js process, which has no such
restriction in the first place. Confirmed by reading `LgWebOsClient.ts`'s own file-header comment,
which already says this outright: "React Native's own WebSocket cannot trust LG's private-CA
certificate ... openSocketWithRelayFallback's fallback path is what actually succeeds ... See
ADR-HEARTH-014." Samsung's driver (`SamsungTizenClient.ts`) is even less exposed to this: per
ADR-HEARTH-005, it targets the *unencrypted* `ws://8001` port directly — no TLS, no cert-trust
question of any kind, on the direct leg or the relay leg.

Neither driver's connect path depends on `expo-dev-client` or any native module — confirmed by
checking `package.json`'s dependencies (no `react-native-tcp-socket` or comparable native-TLS
package is even installed) and `bootstrap.ts` (no conditional driver registration by build type).
A plain dev-client build, if one existed, would not behave any differently here, since the
relay-based fix these two drivers actually use has nothing to do with which client is running —
Expo Go and a dev client both use the same underlying `react-native` `WebSocket`.

**Correction**: strike "LG and Samsung device control will not work in this mode" as this ADR's
consequence. The real, narrower dependency for LG/Samsung to work under `--go` is the same one
every other relay-dependent feature already has: Family Command Center must be paired (Settings)
and its relay reachable — not the driver's transport, and not which Expo client is running. This
correction is to a factual claim this ADR made about *why* something wouldn't work, not to
ADR-HEARTH-045's actual decision (adding `start:go`), which stands unchanged.

**Not verified against real hardware in this update** — this session has no access to Sean's
phone, LG TV, or Family Command Center Pi, so this is a code-derivation correction, not a live
retest. If LG/Samsung pairing genuinely still fails for Sean under `--go` tonight, the cause is
something else (Family Command Center not configured/reachable, the relay's own cert-trust fix
from ADR-HEARTH-014 not actually deployed, or one of the timeout gaps [[ADR-HEARTH-047]] just
fixed in the shared HTTP relay path) — worth Sean confirming directly which of LG/Samsung/other he
actually tried and what error (if any) showed on screen, since "will not work in this mode" as
written was giving a specific, disprovable reason that doesn't hold up.

## Related

ADR-HEARTH-013, ADR-HEARTH-003, [[ADR-HEARTH-044]], ADR-HEARTH-014, [[ADR-HEARTH-047]]
