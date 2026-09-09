# Hearth — Roadmap

Granular, build→test→validate→complete sized tasks. Checked items are done
and verified (tests passing and/or confirmed in Expo Go); nothing is marked
done on the strength of "it compiles."

## Phase 0 — Foundation

- [x] Repository audit (new project, nothing pre-existing to audit)
- [x] Scaffold Expo SDK 57 + TypeScript project (`blank-typescript`)
- [x] Confirm `tsc --noEmit` clean
- [x] Confirm Metro bundler starts with no errors
- [x] Confirm Expo Go on Sean's iPhone matches project SDK (57) — ADR-HEARTH-003
- [x] App naming + logo (ADR-HEARTH-002)
- [x] `docs/DEVICE_FEASIBILITY.md` — researched, sourced
- [x] `docs/EXPO_COMPATIBILITY.md` — researched, sourced
- [x] `ARCHITECTURE.md`
- [x] `ROADMAP.md` (this file)
- [x] Core types: `Device`, `Capability`, `Command`, `CommandResult`, `DeviceState`
- [x] `DeviceDriver` interface
- [x] `DriverRegistry`, `DeviceRegistry`, `StateStore`
- [x] `CommandEngine` with unit tests (device/driver/capability validation, never throws)
- [x] `DiscoveryProvider` interface (reserved, unimplemented)
- [x] Two independent mock TV drivers with unit tests, proving the abstraction (different capability sets, different simulated latency)
- [x] Capability-driven `UniversalTvRemote` + `DeviceListScreen`, wired into `App.tsx`
- [ ] **Sean to validate the running app in Expo Go on his iPhone** (`npx expo start`, scan QR) — first real physical-device checkpoint. Everything above this line has only been validated via `tsc`, `jest`, and a headless Metro bundle check; it has not yet been tapped on a real phone.

## Phase 1 — First real TV driver

Per `docs/DEVICE_FEASIBILITY.md`, Sony's Bravia REST API is the strongest
researched option (official, local, mature) — not Samsung/LG, despite the
mock drivers being named after those two for the brief's own example.
Confirmed as a good pick: Sean owns a real Sony TV to validate against.

- [x] Design `SonyBraviaDriver` against the documented Bravia REST API (sourced method names/params — see ADR-HEARTH-004). IRCC-IP (nav/select/back/home/menu) explicitly deferred, not implemented.
- [x] Implement `SonyBraviaDriver.connect/getState/executeCommand` for power, volume, mute, input — every mutating command re-reads real state afterward rather than assuming success
- [x] Unit tests with a mocked `fetch` for the driver's request/response mapping (11 tests, `src/drivers/tv/sony/`)
- [x] `Device.config` field added to carry per-device connection data (ipAddress/psk)
- [x] `scripts/test-sony-connection.js` — standalone Node script to validate PSK/IP against a real TV without the mobile UI
- [x] "Add device by IP" UI (`AddSonyDeviceScreen`) — attempts a real `driver.connect()` before accepting the device, shows the actual error inline if it fails
- [ ] **Sean: enable IP Control + set a PSK on the real Sony TV, then run `node scripts/test-sony-connection.js <ip> <psk>`** — first real-hardware checkpoint for this driver (or just try "+ Add Sony TV" in the running app)
- [ ] IRCC-IP research + implementation for directional nav/select/back/home/menu (separate follow-up ADR)

## Phase 2 — Second real TV driver (proves the abstraction for real)

Sean confirmed he owns a Samsung TV too, so this started immediately rather
than waiting on Phase 1's hardware checkpoint.

- [x] Research the real Samsung Tizen remote-control WebSocket protocol (sourced against `xchwarze/samsung-tv-ws-api` — exact URL format, pairing-event names, key-press JSON shape, key code list)
- [x] **Correction to `docs/DEVICE_FEASIBILITY.md`**: the original "Expo Go: Partially — WebSocket works" claim was incomplete — only true for the unencrypted `ws://8001` path; modern TVs' encrypted `wss://8002` self-signed-cert path does NOT work in plain React Native `WebSocket` at all. Logged as ADR-HEARTH-005.
- [x] Implement `SamsungTizenDriver` against the unencrypted port 8001 path only, with capabilities honestly scoped (no `inputSelection` — protocol can't jump to a specific input; no `setVolume` — key-press only, no absolute-value API)
- [x] Unit tests with a mocked `WebSocket` (11 tests, `src/drivers/tv/samsung/`)
- [x] `AddSamsungDeviceScreen` UI + `scripts/test-samsung-connection.js` standalone validator
- [x] Confirmed both real drivers (Sony + Samsung) coexist in the same `DriverRegistry` without interference (shared test suite, 38/38 passing) — same `UniversalTvRemote` screen renders both with zero brand-specific UI code
- [ ] **Sean: run `node scripts/test-samsung-connection.js <ip>` (or "+ Add Samsung TV" in-app) against the real TV.** This is a genuine open question, not a formality — if the TV's firmware has dropped port 8001 support, this driver won't connect at all and the encrypted-path follow-up (native module + Dev Build) becomes necessary before Samsung works at all.

### Third real TV driver — LG webOS (started immediately, Sean's LG was live/reachable)

- [x] Research the real LG webOS SSAP WebSocket protocol against `hobbyquaker/lgtv2` — exact register-handshake manifest, request/response envelope, the separate pointer-input socket + `type:button\nname:X\n\n` wire format for button presses, and the documented `ssap://` URI list
- [x] Confirmed the same encrypted-port/self-signed-cert limitation applies to LG's `wss://3001` — and that the unencrypted-only window is narrower than Samsung's (roughly pre-2018 TVs only; 2023+ TVs may be encrypted-only). Logged as ADR-HEARTH-006.
- [x] Implement `LgWebOsDriver` against unencrypted port 3000 only. Declares `powerOff` (not `power`/`powerOn` — no documented way to turn a TV on over this protocol); no `inputSelection` (needs `getExternalInputList` first, not implemented)
- [x] Real read-back for volume/mute (`ssap://audio/getVolume`) using inferred field names — flagged in code/ADR as needing hardware confirmation, not asserted as certain
- [x] Unit tests with a mocked `WebSocket`, including the two-socket (main + pointer) flow (12 tests, `src/drivers/tv/lg/`)
- [x] Extended `UniversalTvRemote` to render "Power On"/"Power Off" buttons when a device declares those capabilities instead of the toggle-style `power` — first real use of the `powerOn`/`powerOff` split in `CapabilityId`
- [x] Consolidated the three `AddXDeviceScreen` wiring props in `DeviceListScreen`/`App.tsx` into one `onAddDevice(brand)` callback once a third brand made the duplication obvious
- [x] `AddLgDeviceScreen` UI + `scripts/test-lg-connection.js` standalone validator
- [ ] **Sean: run `node scripts/test-lg-connection.js <ip>` (or "+ Add LG TV" in-app) against the real TV** — given the narrower unencrypted window, this is more likely than Samsung's case to reveal the driver needs the encrypted-path/native-module follow-up before it works at all
- [ ] All three real drivers (Sony, Samsung, LG) confirmed coexisting: 50/50 tests passing, clean typecheck, Metro bundles — the "second TV integration proves the abstraction" milestone from the original brief is now proven with a *third*

## Phase 2.5 — Family Command Center discovery (no native module needed)

Not a replacement for Phase 3 below — a separate, Expo-Go-compatible
discovery path for households that already run Family Command Center
(a sibling project on the same network). See ADR-HEARTH-010.

- [x] `FamilyCommandCenterDiscoveryProvider` implementing `DiscoveryProvider` against that project's own device-inventory endpoint
- [x] Connection settings screen (base URL + token, persisted with the same AsyncStorage/SecureStore split as device credentials)
- [x] `DiscoverDevicesScreen`: lists results, classifies by known brand, one-tap connect for anything with a real driver, honestly labels the rest "not yet supported"
- [x] Unit tests for the provider (config gating, classification, error handling) with a mocked `fetch` — 5 tests, matching every other driver's test rigor
- [x] Verified end-to-end against the real deployed Family Command Center endpoint via `curl` — real devices returned, wrong/missing token correctly rejected
- [ ] **Sean: tap "Discover devices on your network" in the running app**, enter the real household address + token, confirm a known TV (Sony/LG) actually appears and connects — first real in-app checkpoint for this feature, not yet done

## Phase 3 — Local network device discovery (brand-agnostic, no Family Command Center required)

This is the point `docs/EXPO_COMPATIBILITY.md` identifies as the forced
transition off Expo Go. Still needed for households without a Family
Command Center instance — Phase 2.5 above does not replace this.

- [ ] Stand up an Expo Development Build (`expo-dev-client`) — required before any of the below
- [ ] Add `NSLocalNetworkUsageDescription`/`NSBonjourServices` to `app.json` and verify the real (not Expo Go's) permission prompt
- [ ] Implement an SSDP or mDNS `DiscoveryProvider` for one of the two TV integrations
- [ ] Wire discovered devices into `DeviceRegistry` through a pairing UI

## Phase 4 — Streaming device (done ahead of Phase 3 — Sean confirmed owning a Roku, and ECP needs no Dev Build)

- [x] `RokuEcpDriver` (`src/drivers/streaming/roku/`) against Roku's official ECP docs — first driver sourced from first-party documentation rather than reverse-engineering (ADR-HEARTH-007)
- [x] Real capabilities: `powerOff, volumeUp, volumeDown, mute, channelUp, channelDown, directionalNavigation, select, back, home, inputSelection` — `inputSelection` is genuinely implemented here (documented `InputHDMI1-4`/`InputTuner`/`InputAV1` keys), unlike every TV driver so far
- [x] Real power-state read-back via `GET /query/device-info` (`<power-mode>`/`<model-name>`, both confirmed field names, not inferred)
- [x] 12 unit tests with a mocked `fetch` (`src/drivers/streaming/roku/`); 61/61 total tests passing project-wide
- [x] `AddRokuDeviceScreen` UI + `scripts/test-roku-connection.js` — this protocol has no pairing/auth, so this script is the simplest of the four so far
- [x] Reused `UniversalTvRemote` rather than building a separate `UniversalStreamingRemote` — no behavioral need for a second component yet (see ADR-HEARTH-007's naming-debt note)
- [ ] **Sean: run `node scripts/test-roku-connection.js <ip>` (or "+ Add Roku" in-app)** — expected to be the most likely of the four real drivers to work exactly as written, since Roku's API is officially documented rather than reverse-engineered
- [ ] Playback capabilities (play/pause/rewind/fastForward) — Roku's key list documents `Play`/`Rev`/`Fwd` but these weren't added to `CapabilityId` yet; add once a driver actually needs them (Apple TV, another streaming box) rather than speculatively now

## Out-of-band — first real-device testing session feedback

Sean got the app running via Expo Go (tunnel mode, after a Windows Firewall
block on inbound `node.exe` connections was found and worked around — see
`adr/` for the tunnel-vs-LAN tradeoff) and gave direct feedback while
testing.

- [x] **Device persistence** (ADR-HEARTH-008) — direct response to "a user isn't going to want to add a ton of devices manually." Paired devices now survive app restart (`src/runtime/persistence.ts`, `AsyncStorage` + `expo-secure-store` split for credential fields). Reconnects happen in the background, not blocking app startup. 5 new tests, 66/66 passing project-wide.
- [x] **UI redesign** (ADR-HEARTH-009) — research-informed restyle (Material 3 dark tonal elevation, smart-home card layouts, tvOS-style circular d-pad). New `@expo/vector-icons` dependency (pinned, SDK-57-compatible). Capability-gating logic and all component prop APIs unchanged — styling/layout only. Verified independently: clean typecheck, 66/66 tests, live tunnel bundle updated with no errors.
- [ ] Full auto-discovery (mDNS/SSDP) remains the "real" fix for manual device entry — persistence only addresses the *repeated* re-entry pain. Still blocked on the Expo Development Build transition per Phase 3.
- [ ] Samsung/LG pairing-token persistence (noted as a gap in ADR-HEARTH-008) — would remove their remaining "re-approve every restart" friction.

## Phase 5 — Smart lighting

- [ ] Philips Hue local bridge API per feasibility doc's recommendation
- [ ] `HueDriver`, new `lighting` capabilities (on/off/brightness/color) added to the type only when implemented
- [ ] First cross-category proof: one `Room` screen (see Phase 7) showing a TV and a light together

## Phase 6 — Robot vacuum

- [ ] SwitchBot per feasibility doc's recommendation (the one vacuum ecosystem with a genuinely official public API)
- [ ] `SwitchBotVacuumDriver`, new vacuum capabilities added only as implemented
- [ ] Second vacuum brand once one is confirmed to have a workable API (everything else researched needs reverse-engineering — treat as R&D, not a scheduled task, until one is validated)

## Phase 7 — Rooms

- [ ] `Room` type + assignment of devices to rooms
- [ ] Room-grouped device list screen (replaces the flat `DeviceListScreen`)

## Phase 8 — Scenes / Activities

- [ ] Macro/activity data model (ordered commands + delays, per the brief's "Watch TV" / "Movie Night" examples)
- [ ] One real end-to-end activity spanning two real drivers from Phases 1–5

## Phase 9+ — Not yet scheduled

Automations, cloud sync, accounts, Matter, HomeKit, Alexa/Google Home,
Android physical-device testing, production hardening. Per
`docs/EXPO_COMPATIBILITY.md`, several of these (Matter, HomeKit, BLE) need
dedicated native-module R&D and should each get their own scoped
investigation before a task is written for them — not estimated yet.
