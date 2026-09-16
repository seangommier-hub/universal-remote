# Expo Platform Compatibility — Hearth

**Confirmed project config (read from `package.json` / `app.json` on 2026-09-08):**
- `expo`: `~57.0.21`
- `react-native`: `0.86.3`
- `react`: `19.2.3`
- Template: `blank-typescript`
- Primary near-term test target: **Expo Go on iPhone**

All findings below were checked against current `docs.expo.dev` content for SDK 57 (fetched 2026-09-08), not from training-data memory, because Expo Go's bundled-module list changes release to release.

---

## Read this first: Expo Go availability is currently broken for the stated test plan

Per the official [SDK 57 changelog](https://expo.dev/changelog/sdk-57), **Expo Go for SDK 57 is not yet available on the Apple App Store** — Expo is "still waiting on [Apple's] approval." This has been the pattern since SDK 55: a new Expo Go binary lags each SDK release's App Store approval by some weeks.

Practical consequence for Hearth's stated "immediate real-device test target is Expo Go on iPhone": **that path may not exist right now for a physical iPhone.** Current workarounds per Expo:
- `eas go` — installs a preview build of Expo Go for SDK 57 on a physical iOS device without going through the App Store.
- Standard Expo CLI (`expo start`) targeting an **iOS Simulator** — works today, but is not a physical-device test.
- Android: Expo Go via Play Store / APK is generally not gated the same way.

**Recommendation:** confirm current Apple App Store approval status before assuming Expo Go on a physical iPhone is available; have `eas go` or an Expo Development Build ready as the fallback from day one rather than discovering this mid-sprint. This is independent of all the driver-capability findings below.

---

## Capability-by-capability findings

### 1. Standard HTTP/HTTPS requests (`fetch`)
**Works in Expo Go.** `fetch`/`XMLHttpRequest` are part of the core React Native JS runtime, not an Expo native module — no plugin, no Dev Build, no Expo Go restriction. Works identically in Expo Go, a Dev Build, and standalone builds.

### 2. WebSocket client connections
**Works in Expo Go.** The `WebSocket` global is also part of core React Native (implemented on top of the platform's native networking stack), bundled in every RN/Expo Go runtime. No native module or Dev Build needed for a plain `ws://`/`wss://` client connection.

### 3. Raw TCP socket connections
**Requires Expo Development Build + a native module.** Neither Expo SDK nor Expo Go ships a raw TCP socket API (`expo-network` only exposes device network *info* — IP, connection type, airplane-mode state — not socket primitives). This is a long-standing open Expo feature request ("Support raw TCP sockets"), unresolved. Likely library: **`react-native-tcp-socket`** (needs native linking; not usable in Expo Go; requires `npx expo prebuild` / a Dev Build; watch for a reported incompatibility with `expo-updates` in some `react-native-tcp-socket` versions).

### 4. Raw UDP sockets (SSDP/UPnP, some IR bridges)
**Requires Expo Development Build + a native module.** Same gap as TCP — no Expo-provided UDP API. Likely library: **`react-native-udp`** (Node `dgram`-style API, autolinked, requires native build — not usable in Expo Go).

### 5. mDNS / Bonjour / DNS-SD local network discovery
**Requires Expo Development Build + a native module, AND has an iOS entitlement wrinkle.** No Expo-native mDNS API. Likely library: **`react-native-zeroconf`** (or actively-maintained forks). Two non-obvious requirements beyond installing the package:
- **iOS:** declaring `NSBonjourServices` + `NSLocalNetworkUsageDescription` in `Info.plist` only covers browsing the specific service types you list; broader/dynamic mDNS behavior can require Apple's **Multicast Networking Entitlement**, which must be requested from Apple separately (not just declared in config) — plan for that lead time.
- **Android:** requires `CHANGE_WIFI_MULTICAST_STATE` (plus `INTERNET`/`ACCESS_NETWORK_STATE`/`ACCESS_WIFI_STATE`) in the manifest, and the **Android emulator does not support multicast/IGMP by default** — mDNS discovery must be tested on a physical Android device.
- None of this can be configured or tested inside Expo Go itself.

### 6. SSDP/UPnP discovery
**Requires Expo Development Build + a native module.** SSDP is just UDP multicast (239.255.255.250:1900) plus manual HTTP-over-UDP parsing — there is no dedicated Expo or widely-standard RN "SSDP" package; it's typically hand-rolled on top of **`react-native-udp`**. Same Android multicast-permission and emulator caveats as mDNS (#5) apply.

### 7. Bluetooth Classic
**Requires Expo Development Build + a native module — AND is restricted by iOS at the OS level.** There is no Expo Bluetooth API of any kind (confirmed via Expo's own Bluetooth feature-request tracker — still unresolved/open). Beyond needing a Dev Build and a native module (e.g., an Android-side Bluetooth Classic/SPP library), **iOS has no public Bluetooth Classic/SPP API for third-party apps at all.** Classic Bluetooth accessories on iOS can only be reached via Apple's `ExternalAccessory` framework, which requires the accessory hardware to be **MFi-certified** and the app to be **whitelisted by that specific accessory manufacturer**. If any target device (TV, AVR, etc.) only speaks Bluetooth Classic and isn't MFi-certified, it is **not reachable from iOS at all**, regardless of build type.

### 8. Bluetooth Low Energy (BLE) — central role
**Requires Expo Development Build + a native module.** Confirmed directly from the library's own docs: **`react-native-ble-plx`** "cannot be used in the Expo Go app because it requires custom native code." Path: install `react-native-ble-plx` + the community **`@config-plugins/react-native-ble-plx`** config plugin (sets `NSBluetoothAlwaysUsageDescription` on iOS and Bluetooth permissions on Android), then `npx expo prebuild` / build a Dev Client. This one is otherwise well-supported and commonly used from Expo Dev Builds — no OS-level restriction like Bluetooth Classic has.

### 9. Matter (Thread/Matter commissioning and control)
**Requires Expo Development Build + native modules on both platforms — immature ecosystem, treat as high-risk.**
- **iOS:** Apple's Matter support is split across `Matter.framework` (`MTRDeviceController`, etc.) and `MatterSupport.framework`. Community React Native bindings (`@matter/react-native`, `@matter.js/react-native`) exist but are explicitly labeled **experimental / not production-ready**, with commissioning flows not yet fully working end-to-end per public reports. There is also a documented limitation that an `MTRDeviceController` obtained *through HomeKit* is deliberately crippled (can't be used to commission) — Apple funnels most consumer Matter commissioning through HomeKit itself rather than a raw third-party controller.
- **Android:** Google's **Home Mobile SDK** (`com.google.android.gms.home.matter.*`, e.g. `CommissioningClient`) is the supported path, native Kotlin/Java, requires registering the app's package name in the Google Home Developer Console and handling the `ACTION_COMMISSION_DEVICE` intent. No mature React Native wrapper was found — this would mean writing a custom native module (Expo Modules API) around the Google SDK.
- **Bottom line:** Matter support today means custom native modules on both platforms with no unified cross-platform library, and iOS's own tooling is described by Apple's developer community as actively changing/unstable. Budget this as R&D, not a straightforward integration, and expect it to land well after local-network TV/lighting drivers.

### 10. HomeKit integration (`HMHomeManager`, etc.)
**iOS-only. Requires Expo Development Build + a custom native iOS module + an Apple entitlement.** No Expo or maintained RN package wraps HomeKit natively; the standard approach (per Expo's own "Add custom native code" guidance and community examples) is writing a Swift native module using the Expo Modules API that imports `HomeKit` and bridges `HMHomeManager` events (e.g., via `RCTEventEmitter`/Expo's event-emitter pattern). Requires the `com.apple.developer.homekit` entitlement on the App ID, only meaningful on iOS, and unusable in Expo Go under any circumstance since it's arbitrary native code.

### 11. Background execution / background network tasks
**Partially works in Expo Go for simple cases; full behavior requires Expo Development Build.**
- `expo-task-manager`: confirmed **not available on Android in Expo Go**, and does **not support background execution on iOS** in Expo Go either — only registration/testing of the API surface works there. Expo's own docs say to use a Dev Build "to avoid limitations."
- `expo-background-task`: is listed as "Included in Expo Go" and works on Android/iOS/tvOS, but the underlying **Background Tasks API is unavailable on iOS simulators** (physical device only), Android enforces a **15-minute minimum** re-run interval, and iOS's scheduler is opportunistic (battery/network/usage-pattern-based, frequently deferred to overnight windows) rather than on a guaranteed cadence.
- Net effect for Hearth's "maintain device state / receive push-like updates" goal: neither API gives reliable near-real-time background updates on either OS by design (this is an OS battery-life policy, not an Expo gap) — a push-notification-driven wake model (#14) will likely be doing the real work, with background-task APIs only for periodic best-effort sync.

### 12. iOS 14+ local network permission (`NSLocalNetworkUsageDescription` / `NSBonjourServices`)
**Configurable via Expo config plugin, but not usable inside Expo Go the way it will behave in the shipped app.** Expo supports declaring both keys directly in `app.json`/`app.config.js` under `expo.ios.infoPlist`:
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSLocalNetworkUsageDescription": "Hearth needs local network access to find and control your TVs, streaming devices, and smart lights.",
        "NSBonjourServices": ["_googlecast._tcp", "_airplay._tcp", "_hap._tcp"]
      }
    }
  }
}
```
This only takes effect through `npx expo prebuild` (i.e., a Dev Build or standalone build) — Expo Go runs inside **Expo Go's own compiled `Info.plist`**, so any local-network permission prompt seen while testing in Expo Go will name **"Expo Go,"** not "Hearth," and Expo Go's own fixed `NSBonjourServices` list (not the project's) is what's actually declared. **This means the real local-network permission UX cannot be verified in Expo Go at all — it requires a Dev Build**, independent of whether the underlying discovery code (mDNS/SSDP/raw sockets) already forced that transition.

### 13. Android local network / multicast permissions
**Configurable via Expo (AndroidManifest control through config plugins / `expo.android.permissions` or a plugin's own manifest edits), requires a Development Build to test.** Android does not have an iOS-14-style local-network *runtime prompt* — `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, and `CHANGE_WIFI_MULTICAST_STATE` are install-time "normal" permissions, not something the user is asked about at runtime. Practical gotchas found: Android often needs `android:usesCleartextTraffic="true"` for cleartext HTTP/discovery traffic to local devices, and the **Android emulator drops multicast packets by default**, so any discovery testing (mDNS, SSDP) must happen on a real Android device on the same Wi-Fi network. None of this is configurable or observable from Expo Go.

### 14. Push notifications (state-change alerts)
**Partial in Expo Go — platform-dependent, and getting more restricted.** Per current `expo-notifications` docs: **local (in-app) notifications work in Expo Go on all platforms.** **Remote push notifications on Android have been removed from Expo Go since SDK 53** (a Dev Build is required — Expo cites the inability to auto-configure remote push credentials inside the shared Expo Go binary as the reason). **Remote push on iOS Expo Go is still supported** because Expo can auto-provision it via EAS. Given Hearth targets both platforms, plan for a Dev Build for any Android remote-push testing regardless of when the local-network-driven Dev Build transition happens.

### 15. Secure storage (Keychain / Android Keystore) — `expo-secure-store`
**Works in Expo Go.** Confirmed "Included in Expo Go," backed by iOS Keychain (`kSecClassGenericPassword`) and Android Keystore-backed `SharedPreferences`, also supported on tvOS. Two caveats worth carrying into implementation, not blockers: (a) values are historically capped around ~2KB by the underlying OS APIs on some iOS releases — Expo does not raise its own limit, so large tokens/blobs should be chunked or stored elsewhere; (b) the `requireAuthentication` (biometric-gated) option **does not work in Expo Go** because it needs an `NSFaceIDUsageDescription` Info.plist entry Expo Go's own binary doesn't declare — biometric-gated secure storage needs a Dev Build even though basic secure storage doesn't.

### 16. Home screen / lock screen widgets
**Not available in Expo Go.** Real-hardware/competitive research (2026-09-16): a lock/home-screen widget for one-tap quick actions is a real, evidenced feature request — competing products (Google Home's Favorites widget, Home Assistant's mobile widgets, third-party "Home Widget for HomeKit") all cite avoiding opening the full app as the whole point. Confirmed directly against Expo's own `expo-widgets` docs: "is not available in the Expo Go app — use development builds." Widget code runs in an isolated SwiftUI-only (iOS) / Glance-only (Android) runtime with no access to RN `View`/`Text`, hooks, or async — a fundamentally different rendering environment, not just a permissions gate. Same shape as items #3–#10 above: real, buildable, but only after the Dev Build transition.

---

## Summary table

| # | Capability | Expo Go | Dev Build | Native Module Required | Notes |
|---|---|---|---|---|---|
| 1 | HTTP/HTTPS (`fetch`) | Yes | Yes | No | Core RN networking |
| 2 | WebSocket client | Yes | Yes | No | Core RN networking |
| 3 | Raw TCP sockets | No | Required | Yes — `react-native-tcp-socket` | No Expo API exists; open feature request |
| 4 | Raw UDP sockets | No | Required | Yes — `react-native-udp` | No Expo API exists |
| 5 | mDNS/Bonjour/DNS-SD | No | Required | Yes — `react-native-zeroconf` (or fork) | iOS may need Apple's Multicast Networking Entitlement; Android emulator can't test it |
| 6 | SSDP/UPnP | No | Required | Yes — hand-rolled on `react-native-udp` | Same multicast caveats as mDNS |
| 7 | Bluetooth Classic | No | Required | Yes | **iOS restricted**: no public API without MFi certification per-accessory |
| 8 | BLE central | No | Required | Yes — `react-native-ble-plx` + config plugin | Confirmed explicitly unsupported in Expo Go by the library itself |
| 9 | Matter | No | Required | Yes — both iOS (`Matter.framework`, experimental RN bindings) and Android (Google Home Mobile SDK, no mature RN wrapper) | Immature/experimental on iOS; custom native module likely required on Android too |
| 10 | HomeKit | No | Required | Yes — custom Swift native module | iOS-only; needs `com.apple.developer.homekit` entitlement |
| 11 | Background execution | Partial | Recommended | No (Expo modules exist) but behavior is limited | `expo-task-manager` largely broken in Expo Go; `expo-background-task` works but is OS-throttled/opportunistic everywhere |
| 12 | iOS local network permission | Not testable as-shipped | Required to verify real behavior | No (config plugin via `infoPlist`) | Expo Go shows its own identity/services, not the app's |
| 13 | Android local/multicast permissions | Not testable | Required to verify real behavior | No (manifest/config plugin) | Install-time permissions; emulator can't test multicast |
| 14 | Push notifications | Partial | Required for Android remote push | No (Expo module) | iOS remote push OK in Expo Go; Android remote push removed since SDK 53; local notifications OK everywhere |
| 15 | Secure storage | Yes (basic) | Required for biometric-gated mode | No | ~2KB practical value-size ceiling; `requireAuthentication` needs Dev Build |
| 16 | Home/lock screen widgets | No | Required | No (Expo module, `expo-widgets`) | Isolated SwiftUI/Glance runtime, no RN View/hooks/async — a rendering-environment gap, not just a permission |

---

## What this means for Hearth's build order

The MVP goal is to prove the driver abstraction using **local-network TV/streaming/lighting control first**. Looking only at what that MVP scope actually touches (items 3–6, 12, 13 primarily; BLE/Bluetooth Classic/Matter/HomeKit are later-roadmap, not MVP-blocking):

- **Device discovery is the forcing function, not device control.** Plain HTTP/WebSocket control of an already-known device IP (#1, #2) works fine in Expo Go. But *finding* that device — mDNS/Bonjour (#5, used by AirPlay/Chromecast/HomeKit-adjacent devices), SSDP/UPnP (#6, used by many smart TVs and AVRs), or any raw TCP/UDP protocol (#3, #4) some IR bridges and older AVRs use — has **zero Expo Go support and no config-only workaround**. This is the single earliest thing that forces the jump to a Development Build, likely in the first 1–2 sprints once discovery (rather than a hardcoded IP for a dev unit) is needed.
- **The iOS local-network permission prompt (#12) can't be honestly tested in Expo Go anyway**, since Expo Go presents its own identity and Bonjour service list to iOS, not Hearth's. Even if discovery code were somehow stubbed out, validating the real user-facing permission flow requires a Dev Build.
- **Recommendation: treat "Expo Go only" as valid solely for UI/navigation/state-management prototyping and any driver that talks to a device by a manually-entered IP over HTTP/WebSocket.** The moment discovery work starts (which is early, since driver abstraction needs to enumerate real devices to prove itself against more than one hardcoded target), move to an Expo Development Build (`expo-dev-client` + `npx expo prebuild` or an EAS Dev Build) — do not treat that transition as optional or as something to defer to "later hardware integrations" like BLE/Matter/HomeKit. Those later capabilities (#7–10) don't change this timing; they just add more native modules to a Dev Build the team will already be on.
- Separately: given the current SDK 57 Expo Go App Store approval gap noted above, the team may need to start on `eas go` or a Dev Build immediately regardless of driver work, simply to get onto a physical iPhone at all — worth confirming Apple's approval status before finalizing sprint 1 tooling.
