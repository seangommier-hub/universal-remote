# ADR-HEARTH-212: Settings crash on Sean's phone. The 1.1.0 binary has no motion sensor module

Date: 2026-10-06
Status: Accepted. Shipped as a JS update; the confirmation is Sean's phone opening Settings.
Follows: ADR-HEARTH-196, ADR-HEARTH-207

## Context

Sean, 2026-10-06: "settings is still causing a crash", on his own phone, after ADR-HEARTH-207 shipped.

## Evidence

- **The phones were misidentified.** ADR-196 assumed client `9cdecc60` (app 1.2.0) was Sean's. The
  Pi's client logs show the phone active while Sean was testing is **`b1b1a43e`, app 1.1.0**. Its
  log lines were arriving in real time at 11:28; `9cdecc60` was last seen at 04:19.
- **No breadcrumb at all came from that phone.** Its logs were shipping normally, but there was not
  a single `SettingsVisit` or `ScreenErrorBoundary` line. So the process died before even the
  `opened` stage reached AsyncStorage: within milliseconds of the Settings screen mounting.
  - On Android, the same breadcrumb fired correctly.
  - A JS render error would have been caught by ADR-207's boundary.
  - So this is native, or at least below the JS error path.
- **The installed binary was inspected directly.** With Sean's approval I downloaded EAS build
  `157944ea` (Hearth 1.1.0, preview, built 2026-09-24 from `d35b642`, 11.8 MB) and searched the
  whole `.app`.
  - **No ExpoSensors / Accelerometer module anywhere.**
  - ExpoKeepAwake, ExpoLinking, ExpoSecureStore, ExpoCrypto, ExpoNetwork, ExpoUpdates and
    RNCAsyncStorage are all present.
  - Info.plist has no `NSMotionUsageDescription`, consistent with expo-sensors simply not being in
    that build.
- **Why that binary runs current JS anyway:** `ship-update.sh` publishes every update to both
  runtimes, 1.1.0 and 1.2.0. So Sean's phone has been running Settings code that tries to load the
  motion sensor (Bump to share, ADR-HEARTH-130, 2026-09-24) on a binary without it. That matches the
  first crash report (2026-09-28) and why it never reproduced on Android, web, or the 1.2.0 phone.
  The `require("expo-sensors")` sits in a try/catch meant to make a missing module harmless. On this
  binary it evidently is not: the exact native failure is unproven, but nothing else in the Settings
  tree touches a module that binary lacks.

## Decision

- **`src/runtime/motionSensorSupport.ts`:** `binaryHasMotionSensor(runtimeVersion)` is false for
  `1.1.0`.
- **`useBumpSensor`** checks `Updates.runtimeVersion` first, a plain JS value, so on 1.1.0 it never
  looks up or requires expo-sensors at all.
  - Motion bump can't work on that binary anyway, so nothing is lost.
  - The on-screen Bump button is untouched.
- **Shipped as a JS update** to preview 1.1.0 and 1.2.0, and to family.

## Consequences

- **If Settings opens on Sean's phone:** confirmed. The remaining risk is the general one: any
  future JS that needs a native module added after 2026-09-24 will hit the same wall on 1.1.0.
- **The durable fix is a fresh build on both phones.** Neither installed binary has native modules
  added after 2026-09-24.
  - `ship-update.sh` keeps publishing to 1.1.0 only as long as a phone still runs it.
- **If it still crashes:** the next step is the iPhone's own crash report (Settings > Privacy &
  Security > Analytics & Improvements > Analytics Data > Hearth-...ips). It's the only remaining
  source that sees below JS.
