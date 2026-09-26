# ADR-HEARTH-142: Say why the home network can't be reached instead of failing silently

**Date:** 2026-09-26
**Status:** Accepted, implemented and unit-tested; not yet observed on Leah's iPhone

## Context

Leah's iPhone device log showed every connection to the Family Command Center Pi
(http://192.168.1.172:3210) and to home devices going through an iOS privacy proxy (iCloud Private
Relay / Limit IP Address Tracking) and failing with error 65 (no route to host). The app showed nothing
useful: the network scan "pulled nothing" (indistinguishable from an empty network, because
`scanAllProviders` swallowed every provider failure) and the remote sat on "Reconnecting". Sean: "so that
is a broken functionality." Silent failure is a bug.

## Decision

- `src/core/network/classifyNetworkFailure.ts` (pure) turns a caught error or message into
  `{ kind, message, summary, fixes[] }` with `kind` one of `lan-blocked`, `rejected-token`,
  `not-configured`, `unknown`.
- Classification prefers error class: new `src/core/network/fccErrors.ts` holds `FccUnreachableError`
  (moved out of `httpRelayFallback.ts`), `FccTokenRejectedError` and `FccNotConfiguredError`. The relay
  fallback and the discovery provider now throw them (a raw `fetch` failure becomes
  `FccUnreachableError`). Errors from other modules (sync, bump, config verification) are matched by
  message: "Network request failed", "no route to host", error 65, "didn't respond within", an
  `AbortError`, or a timeout naming a private-range address (10.x, 172.16-31.x, 192.168.x).
- `lan-blocked` fixes, in order: turn off iCloud Private Relay; turn off Limit IP Address Tracking and
  Private Wi-Fi Address for the home Wi-Fi; make sure Hearth is On under Local Network; make sure the
  phone is on the home Wi-Fi, not a guest or kids network.
- Discovery: `scanAllProvidersWithDiagnostics` returns `{ devices, failures }`; `scanAllProviders` keeps its
  old signature (devices only). The discover screen shows the Family Command Center failure (except
  not-configured, which already has its own hint) in place of "No devices found", and above the list when
  SSDP found some.
- Other surfaces: Family Command Center settings Save error, Share and Bump messages (new compact
  `NetworkFailureNotice`), and the remote's `Reconnecting…` card, where only the error sentence is
  replaced (`describeReconnectFailure`), so the remote page gains no height.

## Consequences

- An empty scan caused by an unreachable Pi no longer reads as "no devices on your network".
- The lan-blocked class is a best guess from the failure shape; the same symptoms can also mean the Pi
  is off. The message says "check", and lists the phone-side causes first because that is what happened.
- Message matching is a fallback and can drift if error wording changes; the classifier tests pin it.
- Not changed: the Feeder, Light and Vacuum screens' own reconnect text.
