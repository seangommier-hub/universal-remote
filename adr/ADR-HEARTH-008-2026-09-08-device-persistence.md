# ADR-HEARTH-008: Device persistence — AsyncStorage + SecureStore split

**Date:** 2026-09-08
**Status:** Accepted

## Context

Sean's feedback after using the app: "it needs to be an easy system to add
devices. a user isn't going to want to add a ton of devices manually." Every
paired device was being lost on app restart, meaning re-pairing (including
re-typing Sony's PSK) every session — this was the actual pain, not the
add-device forms themselves. Full auto-discovery (mDNS/SSDP) is a bigger
lift requiring an Expo Development Build (`docs/EXPO_COMPATIBILITY.md`), so
persistence is the immediate, Expo-Go-compatible fix.

## Decision

`src/runtime/persistence.ts` persists paired devices with a security-aware
split:
- Non-sensitive device fields (id, name, category, manufacturer, driverId,
  capabilities, non-credential config like `ipAddress`) go to
  `@react-native-async-storage/async-storage` as one JSON list.
- Config fields that are credentials (currently just `psk`, Sony's
  pre-shared key) are stripped out and stored individually in
  `expo-secure-store`, keyed per device (`hearth.device.<id>.psk`), and
  rehydrated back onto `device.config` on load.

On app startup, persisted devices are added to the registry and shown in
the device list immediately; their `driver.connect()` calls run
**afterward, in the background**, not blocking `ready` state. This matters
because Samsung/LG's `connect()` waits up to 20-30s for an on-screen
pairing prompt — blocking app startup on that would mean the whole app
hangs on a loading spinner if the user isn't standing next to that TV when
they open the app.

## Rationale

Per this project's security rules (never store secrets in plaintext),
`AsyncStorage` alone was not an acceptable place for Sony's PSK — it's
unencrypted device storage. `expo-secure-store` is backed by iOS
Keychain/Android Keystore, confirmed Expo-Go-compatible for basic
(non-biometric-gated) use in `docs/EXPO_COMPATIBILITY.md`. Splitting config
per-field rather than picking one storage mechanism for the whole device
keeps the common case (device metadata) simple while still protecting the
one field that's actually a credential.

## Consequences

- Samsung and LG's pairing token (`client-key` for LG's real protocol) is
  **not yet persisted** — those drivers don't currently extract/expose a
  reusable token from the pairing handshake, so every app restart still
  means a fresh on-screen approval for those two, even though the *device
  entry itself* now survives restart. A real fix requires extending
  `DeviceDriver`/these two drivers to surface a persistable token — tracked
  as follow-up work, not done here to keep this change scoped.
- If more credential-shaped config fields appear for future drivers (e.g.
  an OAuth token), add their key to `SENSITIVE_CONFIG_KEYS` in
  `persistence.ts` rather than inventing a new mechanism.
- No "remove device" UI exists yet even though `removeDevice()` is
  implemented and tested — added for completeness/symmetry, wire up the UI
  when device management screens are built.
