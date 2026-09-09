# Hearth — Architecture

Status snapshot as of 2026-09-08. This document describes what is actually
built, and marks everything else as planned. See `adr/` for the reasoning
behind each decision; see `ROADMAP.md` for what's next.

## Layering

```
UI (capability-driven screens)
        |
CommandEngine   <-- the only thing the UI calls
        |
DeviceDriver (one implementation per manufacturer/protocol)
        |
Real device / mock
```

The UI never imports a driver directly. It only ever calls
`CommandEngine.execute(command)` and reads state from `StateStore`. This is
what lets a Roomba integration break without touching Samsung TV code, and
what lets the same `UniversalTvRemote` screen drive a Samsung mock and an LG
mock with zero brand-specific branching.

## Built today (`src/core/`, `src/drivers/tv/`, `src/drivers/streaming/`, `src/ui/`, `src/runtime/`)

| Piece | File | Status |
|---|---|---|
| `Device` | `src/core/types/Device.ts` | Implemented |
| `CapabilityId` | `src/core/types/Capability.ts` | Implemented — TV/entertainment capabilities only so far |
| `Command` / `CommandResult` | `src/core/types/Command.ts` | Implemented |
| `DeviceState` | `src/core/types/DeviceState.ts` | Implemented |
| `DeviceDriver` interface | `src/core/drivers/DeviceDriver.ts` | Implemented |
| `DriverRegistry` | `src/core/drivers/DriverRegistry.ts` | Implemented |
| `DeviceRegistry` | `src/core/registry/DeviceRegistry.ts` | Implemented, in-memory (still resets on restart — but `src/runtime/persistence.ts` now reloads paired devices back into it on startup, see below) |
| `StateStore` | `src/core/state/StateStore.ts` | Implemented, in-memory, subscribe/patch |
| `CommandEngine` | `src/core/engine/CommandEngine.ts` | Implemented — validates device/driver/capability, never throws to the caller |
| `DiscoveryProvider` interface | `src/core/discovery/DiscoveryProvider.ts` | Interface only, no implementation |
| Mock TV drivers | `src/drivers/tv/samsung/`, `src/drivers/tv/lg/` | Two independent mocks proving the abstraction (different capability sets, different simulated latency) |
| `SonyBraviaDriver` | `src/drivers/tv/sony/` | First **real** driver — sourced against Sony's official REST API (ADR-HEARTH-004). Implements power/volume/mute/input only (not nav — see ADR). Every mutating command re-reads real state afterward. Unit-tested against a mocked `fetch`; **not yet validated against real hardware** — see `scripts/test-sony-connection.js` and `ROADMAP.md` Phase 1. |
| `SamsungTizenDriver` | `src/drivers/tv/samsung/` | Second **real** driver — sourced against the community `samsungtvws` reference protocol (ADR-HEARTH-005). Unencrypted `ws://8001` only; modern TVs' encrypted `wss://8002` path is NOT supported (RN's `WebSocket` can't accept its self-signed cert without a native module — a real gap the original feasibility research missed). State is optimistic (assumed from the command sent), not read back — this protocol has no query API, unlike Sony's. Implements power/volume/mute/channel/nav/menu; NOT `inputSelection` or `setVolume` (protocol can't do either). Unit-tested against a mocked `WebSocket`; **not yet validated against real hardware** — see `scripts/test-samsung-connection.js`. |
| `LgWebOsDriver` | `src/drivers/tv/lg/` | Third **real** TV driver — sourced against the community `lgtv2` reference protocol (ADR-HEARTH-006). Unencrypted `ws://3000` only; same encrypted-cert limitation as Samsung, with a narrower unencrypted-only window (roughly pre-2018 TVs). Declares `powerOff` only (no `power`/`powerOn` — protocol can't wake a TV). No `inputSelection` (needs `getExternalInputList`, not implemented). Volume/mute read back for real; field names inferred from convention, not officially documented — flagged as needing hardware confirmation. Button presses (nav/select/back/home/menu) go through a *separate* pointer-input WebSocket, not the main command socket. Unit-tested against a mocked `WebSocket`; **not yet validated against real hardware** — see `scripts/test-lg-connection.js`. |
| `RokuEcpDriver` | `src/drivers/streaming/roku/` | First **streaming-device** driver, and the first sourced from Roku's own official docs rather than reverse-engineering (ADR-HEARTH-007). Plain HTTP, no pairing/auth/TLS — simplest of the four real drivers so far. Genuinely implements `inputSelection` (documented `InputHDMI1-4` keys) unlike every TV driver. Real power-state read-back via `/query/device-info`. Unit-tested (12 tests); **not yet validated against real hardware** — see `scripts/test-roku-connection.js`. |
| `AddSonyDeviceScreen` / `AddSamsungDeviceScreen` / `AddLgDeviceScreen` / `AddRokuDeviceScreen` | `src/ui/` | Manual IP (+ PSK for Sony) pairing forms. All four attempt a real `driver.connect()` before accepting the device — no fake success. Wired through one `DeviceListScreen.onAddDevice(brand)` callback (consolidated once a third brand made near-identical props obvious) rather than one generic form component — the screens differ enough (PSK field, pairing-wait duration, warning copy) that a shared form isn't clearly simpler yet. |
| `UniversalTvRemote` | `src/ui/UniversalTvRemote.tsx` | Renders controls purely from `device.capabilities` — no manufacturer branching |
| `DeviceListScreen` | `src/ui/DeviceListScreen.tsx` | Implemented |
| Composition root | `src/runtime/bootstrap.ts` | Wires the two mock drivers + two seed devices, plus all four real drivers |
| Device persistence | `src/runtime/persistence.ts` | ADR-HEARTH-008. Paired devices survive app restart: non-credential fields in `AsyncStorage`, credential fields (currently just Sony's `psk`) in `expo-secure-store`, split automatically. Loaded on startup and re-registered; `driver.connect()` for each runs in the background (not blocking the loading screen) since Samsung/LG can wait up to 30s for an on-screen prompt. Samsung/LG's pairing token itself isn't persisted yet — those two still need a fresh on-screen approval every restart even though the device entry survives. |

All of the above have unit tests (`npm test` — 16 tests passing as of this
writing) except the UI components, which have not been given automated
tests yet (manual Expo Go verification only).

**Note on naming:** the two mock drivers are named after Samsung and LG
because that's the brief's own illustrative example, not because those are
the confirmed first real integrations — see `docs/DEVICE_FEASIBILITY.md`
and `ROADMAP.md` for the actual first real driver pick (Sony, based on API
maturity research, not brand).

## Planned, not built (do not assume these exist)

- **Discovery**: mDNS/SSDP/BLE/manufacturer account-linking implementations. Interface exists; nothing implements it. Per `docs/EXPO_COMPATIBILITY.md`, real local-network discovery requires an Expo Development Build — this is the first forcing function off Expo Go.
- **Real device drivers**: every driver today is a mock. No network calls to a real TV/light/vacuum exist yet.
- **Persistence**: `DeviceRegistry` and `StateStore` are in-memory and reset on app restart. No AsyncStorage/SQLite/cloud sync yet.
- **Room model, Scenes, Automations, Macros**: not started.
- **Pairing flows**: not started.
- **Command Engine retries/timeouts**: `CommandEngine` currently does a single attempt and surfaces failure; no retry policy yet.
- **Security**: no auth, no token storage, no household isolation yet — there's nothing to secure until real accounts/devices exist. `expo-secure-store` is confirmed Expo-Go-compatible for when it's needed (see `docs/EXPO_COMPATIBILITY.md`).
- **Navigation library**: the app currently swaps between two screens via local `useState` in `App.tsx`. React Navigation (or Expo Router) gets added once the screen count actually justifies it — not before.

## Networking / Expo constraints

See `docs/EXPO_COMPATIBILITY.md` for the full research. Headline: plain
HTTP/WebSocket control of a device at a known IP works fine in Expo Go;
*finding* that device (mDNS, SSDP, raw TCP/UDP) does not, and forces a move
to an Expo Development Build early in Phase 1 (first real driver), once a
manually-entered IP is no longer good enough.

## Device/ecosystem feasibility

See `docs/DEVICE_FEASIBILITY.md` for the full researched matrix across TVs,
streaming, audio, smart-home platforms, and robot vacuums, with sourced
GREEN/YELLOW/RED classifications and a recommended MVP pick per category.
