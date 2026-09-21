# ADR-HEARTH-118: Robot vacuum integration via SwitchBot's official OpenAPI

**Date:** 2026-09-21
**Status:** Accepted, implemented; not yet live-verified against real hardware

## Context

Phase 6 of `ROADMAP.md`, picked up as the next unstarted phase ("keep moving," no specific target
given). SwitchBot was already the roadmap's own recommendation — the one robot-vacuum ecosystem
with a genuinely official, documented public API, per `docs/DEVICE_FEASIBILITY.md`.

## Research: verified the real mechanism before building

Read SwitchBot's official OpenAPI docs directly (github.com/OpenWonderLabs/SwitchBotAPI, v1.1),
including the per-model command references under `devices/robot-vacuum/`:

- **Auth**: a static Open Token + Secret pair the user generates themselves in the SwitchBot app
  (Profile → Preferences → About → tap App Version 10× → Developer Options → Get Token) — never
  their SwitchBot account password. Every request is HMAC-SHA256 signed
  (`token + 13-digit-ms-timestamp + nonce`, keyed by the secret, base64, uppercased) — the exact
  algorithm and header names (`Authorization`/`sign`/`t`/`nonce`) came straight from the README,
  not guessed.
- **Command set**: Robot Vacuum Cleaner S1/S1 Plus and Mini Robot Vacuum K10+/K10+ Pro/K11+ all
  document the identical four-command set (`start`, `stop`, `dock`, `PowLevel` 0–3). The newer,
  mop-capable Floor Cleaning Robot S10/S20 and K10+ Pro Combo/K20+ Pro use a different, richer
  `startClean`/`changeParam` shape — deliberately not implemented in this pass, matching this
  project's "declare only what's confirmed real" standard. `SUPPORTED_VACUUM_DEVICE_TYPES` in
  `SwitchBotVacuumDriver.ts` filters to exactly the five real deviceType strings this driver
  actually implements.
- **Status fields**: `workingStatus` (9-value enum), `onlineStatus`, `battery` — confirmed field
  names, not inferred.

This is the first driver in the project that talks to a **cloud** API rather than a LAN device —
no IP address, no relay/pairing dance, no `requestWithRelayFallback`. A plain direct HTTPS call
from the phone works from anywhere, the same way it would from any other internet client.

## What was built

- **`@noble/hashes@2.4.0`** added as a pinned dependency for HMAC-SHA256 — audited, zero-dependency,
  actively maintained (Paul Miller's noble-* library family). This project's own standing rule
  ("prefer well-established libraries over rolling your own for cryptography") ruled out
  hand-implementing HMAC from a raw SHA-256 primitive, which `expo-crypto` alone doesn't expose.
  Base64 encoding of the resulting signature bytes IS hand-written (`bytesToBase64` in
  `SwitchBotClient.ts`) — a plain RFC 4648 encoding, not a cryptographic operation, and safer than
  relying on React Native's global `btoa` (which expects a binary string, not UTF-8 bytes — a
  common source of silent mis-encoding).
- **Jest/ESM fix**: `@noble/hashes` ships pure ESM; Jest's default `transformIgnorePatterns`
  (via `jest-expo`) doesn't transform it, so `package.json`'s jest config now extends that same
  pattern with `@noble` added — the exact existing regex, not a blanket "transform everything"
  override that could slow every other test file's node_modules resolution.
- **`SwitchBotClient.ts`**: signs and sends `GET /v1.1/devices`, `GET /v1.1/devices/{id}/status`,
  `POST /v1.1/devices/{id}/commands`. 6 tests, including one asserting the real per-request
  nonce/timestamp produce a different signature each call (not memoized), and one distinguishing
  an HTTP-level failure from a real API-level error (`statusCode !== 100` on an HTTP 200 — e.g.
  code 190 "invalid token").
- **`SwitchBotVacuumDriver.ts`**: `vacuumStart`/`vacuumStop`/`vacuumDock`/`setSuctionPower`
  capabilities (new `CapabilityId`s). Re-reads real status after every command, same "never assume
  success" pattern as every other driver. Caught and fixed the exact class of bug
  `RokuEcpDriver.ts` already found and fixed (2026-09-09): a plain argument-validation error
  (`setSuctionPower` with an out-of-range level) was initially caught by the same handler as a
  real network failure, wrongly marking a healthy device disconnected and starting a pointless
  reconnect loop — fixed with a dedicated `SwitchBotValidationError` type, mirroring
  `RokuValidationError`'s already-proven fix. Caught live by a real cross-test timer-pollution
  failure while writing tests, not by inspection — the stale reconnect timer from a wrongly-
  triggered retry leaked into and corrupted a later test's mocked fetch sequence. 11 tests.
- **`persistence.ts`**: added `"secret"` to `SENSITIVE_CONFIG_KEYS` proactively — the exact class
  of gap ADR-HEARTH-091's security audit found missing for LG/Samsung's credential fields, applied
  here before it could repeat rather than after a fresh audit catches it.
- **`AddSwitchBotVacuumScreen.tsx`**: token/secret entry (never the SwitchBot account password) →
  lists devices → filters to the five supported vacuum `deviceType`s → pick one. Same two-step
  shape as `AddHueDeviceScreen.tsx`.
- **`VacuumControlScreen.tsx`**: Start/Stop/Dock buttons, a 4-level suction picker, and status
  pills (connection, working status mapped to a real label/icon per the documented enum, battery
  percentage). Not a scaled-down `UniversalTvRemote` — a vacuum's capability set shares no real
  controls with a TV remote's, same reasoning as `LightControlScreen.tsx`.
- Wired into `bootstrap.ts`, `DeviceListScreen.tsx`'s add-menu (`AddableBrand` gets `"switchbot"`,
  deliberately excluded from `MANUAL_ADD_BRANDS` since this is cloud/token-based, not IP-based —
  same treatment as SmartThings), and `DevicesTabScreen.tsx`'s screen routing (`category ===
  "vacuum"` branches to `VacuumControlScreen`, mirroring the existing `lighting` branch).

## Testing

`npx tsc --noEmit` clean. Full suite 928/928 passing (18 new tests: 6 client, 11 driver, 1
persistence).

## Consequences

- **Not yet live-verified against a real SwitchBot vacuum** — no device was available this
  session. Every mechanism (auth signing, endpoint shapes, command names, status fields) is sourced
  directly from the official docs, not guessed, but the same honest caveat every other driver's
  first pass carries applies here too.
- The newer mop-capable S10/S20/K10+ Pro Combo/K20+ Pro models remain a clean, scoped follow-up —
  not silently expanded to, not forgotten either, the same pattern ADR-HEARTH-076/079 used for
  LG's recent-apps row.
- This is the first cloud-API driver in the project — a real, useful precedent if a future
  integration also has no LAN component (the relay-fallback machinery every other driver leans on
  simply doesn't apply here).
