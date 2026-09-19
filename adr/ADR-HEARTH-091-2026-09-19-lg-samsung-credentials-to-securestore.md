# ADR-HEARTH-091: LG's clientKey and Samsung's token moved into SecureStore

**Date:** 2026-09-19
**Status:** Fixed

## Context

A security audit (run by an agent, requested after Sean's "increase security" ask) found one real,
concrete gap: `src/runtime/persistence.ts`'s `SENSITIVE_CONFIG_KEYS` only ever protected Sony's
`psk`. LG's `clientKey` (the SSAP pairing key that lets Hearth control a TV without re-approving its
on-screen prompt every time, ADR-HEARTH-021) and Samsung's `token` (the equivalent Tizen pairing
credential) are the same class of real device-pairing secret, but were never added to this list —
landing in plain AsyncStorage instead. ADR-HEARTH-008 already documented the standing rule ("if a
future driver introduces a real credential, add their key to `SENSITIVE_CONFIG_KEYS`") that this
should have followed; it just never did.

The same audit re-checked an earlier concern from this session (raised on a mistaken premise that
`NSAllowsArbitraryLoads` was `true`) and confirmed, independently, that it has always been `false`
across every build inspected — no ATS fix was ever actually needed; that finding is retracted (see
ADR-HEARTH-090's own retraction, now doubly confirmed).

## Decision

`SENSITIVE_CONFIG_KEYS` is now `["psk", "clientKey", "token"]`. No other driver's `config` shape
holds a real credential — Roku, Kasa, SmartThings, Hue, Yamaha, and Xbox were all individually
checked and only carry `ipAddress`/`deviceId`/`liveId`/`hwaddr`, relying on Family Command Center's
own SecureStore-backed token (already correct, unchanged) rather than a locally-held secret.

## Verification

Added test coverage mirroring the existing `psk` tests: `saveDevice` routes both `clientKey` and
`token` into SecureStore, not AsyncStorage. Fixed a pre-existing test that used a blanket
`SecureStore.getItemAsync` mock (`mockResolvedValue("super-secret-psk")` for every call) — now that
`loadDevices` checks all three keys per device, that mock was incorrectly "rehydrating" `clientKey`
and `token` onto a device that never had them; narrowed to a per-key implementation. Full suite:
34 suites / 366 tests passing, `tsc --noEmit` clean.

## Consequences

- Existing users' already-persisted LG/Samsung pairing keys remain in AsyncStorage until the next
  time that device reconnects and re-saves (the normal `saveDeviceQuietly` path in `App.tsx`) — no
  migration was written to force-move already-stored plaintext values, since they'll self-correct
  on next use and a one-time migration for two fields isn't worth the added code.
- This closes out the one real action item from the security audit; ATS/NSAppTransportSecurity,
  Family Command Center's own token storage, hardcoded secrets, and TLS-validation bypasses were
  all checked and found already correct or already documented (the LG relay's TLS trust bypass is
  server-side on Family Command Center, never in the phone app, per ADR-HEARTH-014).
