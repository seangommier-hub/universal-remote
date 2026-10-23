# ADR-HEARTH-232: Relay fallback and Wake-on-LAN must use the Keychain-safe config loader

**Date:** 2026-10-22
**Status:** Accepted, implemented, tested
**Follows:** ADR-HEARTH-196, ADR-HEARTH-203

## Context

Sean reported Hearth "broken" on his iPhone: TVs would turn on/off but nothing else (no volume,
input, nav, launchApp) worked. He suspected schema drift from another Claude Code session.

Pulled Sean's own phone's live client logs from the Pi (`~/.hearth-client-logs/b1b1a43e*.jsonl`,
client `b1b1a43e`, app `1.1.0`) covering the last ~26 hours. Every single LG and Sony
reconnect/connect attempt in that window failed with the identical error:

```
FunctionCallException: Calling the 'getValueWithKeyAsync' function has failed
(at ExpoModulesCore/AsyncFunctionDefinition.swift:123)
→ Caused by: KeyChainException: User interaction is not allowed.
(at ExpoSecureStore/SecureStoreModule.swift:168)
```

This is the exact failure ADR-HEARTH-203 (2026-09-28) already investigated and fixed — once. That
ADR traced the error to `familyCommandCenterDeviceLookup.ts`'s self-heal lookups calling
`loadFamilyCommandCenterConfig()` with no guard, and fixed it there with a local
`loadConfigSafely()` wrapper. It explicitly stated: *"`LgWebOsDriver`/`SamsungTizenDriver`/
`SonyBraviaDriver`'s own connect/refresh paths do not read SecureStore directly... the only live
SecureStore read in the whole reconnect path, for every driver, is the self-heal lookup fixed
above."*

That claim was true in September and is no longer true. Tracing today's actual failing log lines:

- `LgWebOsDriver.connectClient()`'s catch logs `` `${device.name} failed to connect at
  ${config.ipAddress} — checking Family Command Center for its current address` `` with the real
  thrown error as `meta.message`. The error comes from `LgWebOsClient.connect()`, which opens its
  socket via `openSocketWithRelayFallback()` (`src/core/network/wsRelayFallback.ts`) — and that
  function calls `loadFamilyCommandCenterConfig()` **directly, with no guard**, whenever the
  direct connection fails and it falls back to the relay (which it did on every attempt in the
  log — Sean's LG TV needed the relay for every reconnect in this window).
- `SonyBraviaDriver`'s `Failed to reach Den TV at 192.168.1.217` logs came from the same gap in
  `httpRelayFallback.ts`'s `callRelay()`.
- `AutoWakeOnReconnect`'s `${device.name} automatic wake failed` logs came from the same gap in
  `wakeOnLan.ts`'s `sendWakeOnLan()`.

All three are **separate, un-audited call sites** of the exact same raw
`loadFamilyCommandCenterConfig()` that ADR-203 fixed in one place
(`familyCommandCenterDeviceLookup.ts`) and believed was the only place. It was not — the relay
fallback and Wake-on-LAN paths are the ones a device actually needs every time it can't be reached
directly (a different network segment, or the common case of a TV that needs the relay at all), so
this gap is hit far more often than the self-heal lookup ADR-203 fixed.

**Why this produces "power works, nothing else does":** the power button sends via Wake-on-LAN /
a fire-and-forget command and stays enabled regardless of connection state (by design — you need
to be able to wake an off/disconnected TV). Every other button is gated on the device actually
reaching `connection: "connected"`, which requires `connect()` to succeed — and while the phone is
locked or the app is backgrounded (which is most of the time a phone sits in a pocket), every
relay-dependent `connect()`/reconnect/auto-wake attempt was throwing this raw native exception
instead of a plain "try again" result, so the device stayed stuck on `disconnected` with only the
always-enabled Power button doing anything.

Checked whether this was instead the newly-shipped ADR-HEARTH-231 (today, ~1 hour before the
report) LG fail-fast timeout change: ruled out — every failing log line's `meta.message` is the
Keychain exception, not a pairing-timeout message, so the failure happens before `register` is
even sent, at socket-open time inside the relay fallback.

## Decision

Promoted the existing `loadConfigSafely()` pattern (ADR-203) from a private helper in
`familyCommandCenterDeviceLookup.ts` to a shared, exported `loadFamilyCommandCenterConfigSafely()`
in `familyCommandCenterConfig.ts` itself — same contract (never rejects; `null` on a
Keychain-unavailable read, logged `debug`, or on any other read failure, logged `warn`; the real
config otherwise). `familyCommandCenterDeviceLookup.ts` now calls the shared one instead of its own
copy.

Switched the three previously-unguarded call sites to it:
- `src/core/network/wsRelayFallback.ts` (`openSocketWithRelayFallback`)
- `src/core/network/httpRelayFallback.ts` (`callRelay`)
- `src/core/network/wakeOnLan.ts` (`sendWakeOnLan`)

Each already had an existing, correct "not configured" branch for a `null` config (a plain,
human-readable error, already covered by every existing retry/backoff path) — a Keychain hiccup
now resolves into that exact same branch instead of throwing past it.

**Deliberately not widened to every direct caller of `loadFamilyCommandCenterConfig()`.** A fresh
audit (this ADR) found several more: `fccJsonRequest.ts` (shared by Ps5Client, BroadlinkClient,
ChromecastClient, AppleTvClient, AndroidTvClient) and inline copies in `KasaClient.ts`,
`GoveeClient.ts`, `AlexaPlugClient.ts`, `SmartThingsClient.ts`, `XboxDriver.ts`,
`fccCameraApi.ts`/`FccCameraDriver.ts`. These are the same bug class but were not implicated in
Sean's actual report (no TV in his log uses any of them) and widening now would multiply this
change's test-file surface well past what diagnosing and fixing the reported break requires.
Flagged here as a known follow-up, not fixed.

## Testing

- New: `familyCommandCenterConfig.test.ts` — 3 cases for `loadFamilyCommandCenterConfigSafely()`
  (Keychain error → `null`, unrelated error → `null`, success → the real config).
- `wsRelayFallback.test.ts`, `httpRelayFallback.test.ts`, `wakeOnLan.test.ts`: existing
  "not configured" (`null`-config) tests now exercise the exact branch a Keychain hiccup also
  lands in — retargeted their mocks from `loadFamilyCommandCenterConfig` to
  `loadFamilyCommandCenterConfigSafely` to match the real call site.
- `familyCommandCenterDeviceLookup.test.ts`: retargeted the same way; removed the two tests that
  exercised the old local wrapper's own Keychain-catching logic (that logic lives in the shared
  function now, tested in `familyCommandCenterConfig.test.ts`).
- 13 driver/network test files that mock `familyCommandCenterConfig` wholesale (`LgWebOsDriver`,
  `LgWebOsClient`, `SamsungTizenDriver`, `SamsungTizenClient`, `SonyBraviaDriver`, `RokuEcpDriver`,
  `SonosDriver`, `DenonDriver`, `YamahaMusicCastDriver`, `ChromecastDriver`, `driverCallTimeouts`,
  `remoteFromAnywhere`) updated to mock the function their production code actually calls; three of
  them (`driverCallTimeouts`, `remoteFromAnywhere`, `ChromecastDriver`) also exercise a client that
  calls the *raw* `loadFamilyCommandCenterConfig()` directly (Kasa/AppleTv/Ps5/Xbox/Broadlink/
  Chromecast), so those mocks provide both functions.
- Full suite: `npx tsc --noEmit` clean; `npx jest` (excluding `scratch/`, `runner/shims`, and other
  sessions' `.claude/worktrees/`) — 3282/3282 suites, 37871 passed, 306 skipped (pre-existing),
  0 failed.

## Consequences

- A locked or backgrounded phone no longer throws a raw native Keychain exception out of relay
  fallback or Wake-on-LAN — it degrades to the same "try again" path as a genuinely unconfigured
  app, which every caller already handles via normal backoff/retry.
- Not yet confirmed on Sean's real phone (he's away from it per a sibling session's note while this
  was written) — the fix is logic-verified and OTA-publishable (JS-only, no native module change,
  safe for both the 1.1.0 and 1.2.0 installed binaries per ADR-HEARTH-212's constraint).
- Known, explicitly-not-fixed follow-up: the same unguarded-`loadFamilyCommandCenterConfig()`
  pattern remains in `fccJsonRequest.ts` and several drivers' own inline relay code (Kasa, Govee,
  Alexa plug, SmartThings, Xbox, Ring camera). Worth a dedicated pass if any of those devices show
  the same "works when unlocked, stuck disconnected otherwise" symptom.
