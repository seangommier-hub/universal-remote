# ADR-HEARTH-157: Web-based UI verification harness with demo fixtures

**Date:** 2026-09-26
**Status:** Accepted, implemented

## Context

Layout questions ("does the remote fit an iPhone 17 without scrolling", "is Discover clean") could only
be answered on a phone. The AI assistant has no way to see the UI at all. ADR-HEARTH-135 explicitly
recorded "fit not yet confirmed on a real iPhone 17".

## Decision

Render the real app through react-native-web, in a demo mode, and drive it with Playwright.

- Deps: `react-dom`, `react-native-web`, `@expo/metro-runtime` (via `expo install`), dev dep `playwright`.
- `metro.config.js` `resolveRequest` aliases, only for `platform === "web"` (and for `expo-secure-store` /
  AsyncStorage on native only when the bundle is built with `EXPO_PUBLIC_DEMO=1`): `expo-secure-store` to
  `src/web/secureStore.ts`, AsyncStorage to `src/web/asyncStorage.ts`, `react-native-udp` to an empty stub.
  expo-updates, expo-haptics, expo-sensors, expo-camera and expo-network needed no shim (their web paths are inert).
- Demo mode (`src/demo/`): on only when `EXPO_PUBLIC_DEMO === "1"` at build time, or `?demo=1` on web.
  It swaps every driver for an offline twin with the same id and capabilities, loads six fixed devices
  (LG on, Samsung off, unreachable Roku, Sonos, Kasa, Broadlink), three Activities, and a fake `discover/all`
  body (6 recognized, 21 others). Storage is memory-only (never real keys), and `fetch` is replaced so demo can
  reach nothing except its own fixture host. A device outside the fixture (one being paired) waits, so the
  pairing card can be seen.
- Safe area: `IphoneSafeAreaEmulation` overrides insets to top 62 / bottom 34 on web only (SafeAreaProvider's own
  web measurement always reports 0, so `initialMetrics` alone is overwritten).
- `?screen=` deep entry lives only in `src/demo/demoScreenRoute.ts`, read once by `DevicesTabScreen`'s initial state.
- `scripts/ui-verify/`: builds the export, serves it with a tiny static server, screenshots 12 scenarios at
  393x852 @3x, asserts no vertical scroll on remote pages. The page scroller is found as the tallest `div`
  with computed `overflow-y` auto/scroll (RN-web renders ScrollView that way); overflow = scrollHeight - clientHeight.
- Icon "boxes" seen in the research pass were the static server, not the app: Expo emits the Ionicons font under
  `assets/node_modules/...`, which many static servers refuse to serve. Our server serves it; icons render.

## What web cannot verify

Real SF fonts and text metrics (web uses a fallback sans, so wrapping can differ by a few px), real safe-area
behaviour, native animations/haptics, gestures, keyboard avoidance, and the native tab bar (the web tab bar
label is clipped at the bottom, a web-only quirk). Treat PASS as strong evidence, not proof.

## Defects found

- Remote (LG, 4 inputs): 22px overflow at 393x852. Fixed by tightening padding of the streaming and input cards
  and dropping the utility card's bottom margin (ADR-HEARTH-135's named "next levers"); now fits with 1px spare
  (very tight: a TV with 5+ inputs, or SF font metrics, may still scroll).
- Activities editor: "Add a step" buttons (Delay, Wait until on) rendered as icon only, label missing.
  `CapabilityButton` skipped the label whenever an icon was given; fixed to show it for non-circle buttons.
- Not fixed: Roku offline remote scrolls 62px because the reconnect card is shown (expected, disabled controls);
  Devices header tagline truncates ("One home. One ..."); web tab-bar label clipped (probable web-only).
- Harness bug found on the way: the demo driver published state synchronously, and the state bridge's initial
  `getState()` seed overwrote it with "unknown"; demo drivers now yield a macrotask like a real socket.

## Consequences

- Demo code ships in native bundles (about 22KB of source, dead unless the env var is set at build time);
  a `?demo=1` URL cannot exist on native. `npx expo export -p ios` still succeeds.
- `expo-doctor` reports four failures unrelated to these packages (peer deps, duplicates, RN Directory, six
  out-of-date Expo packages); not changed here.
