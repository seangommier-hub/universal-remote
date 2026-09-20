// Dynamic config (replaces app.json) so distribution channels can use different bundle
// identifiers: com.hearthremote.app (no personal name, ADR-HEARTH-080) for development/preview
// ad-hoc installs, com.seangommier.hearthapp (an existing App Store Connect app record from
// earlier local AltServer work) for the production/TestFlight channel (ADR-HEARTH-083).
const IS_PRODUCTION = process.env.APP_VARIANT === "production";

const BUNDLE_IDENTIFIER = IS_PRODUCTION ? "com.seangommier.hearthapp" : "com.hearthremote.app";

module.exports = {
  expo: {
    name: "Hearth",
    slug: "hearth",
    scheme: "hearth",
    // Bumped from 1.0.0 (ADR-HEARTH-106): 1.1.0 added react-native-gesture-handler/screens.
    // Bumped again to 1.2.0 (ADR-HEARTH-110): adds react-native-jsi-udp, another new native
    // module (a real experiment in direct-from-phone Wake-on-LAN) — same runtimeVersion-isolation
    // reasoning as the 1.1.0 bump applies again here.
    version: "1.2.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    backgroundColor: "#12141C",
    ios: {
      supportsTablet: true,
      bundleIdentifier: BUNDLE_IDENTIFIER,
      // Real gap found live (2026-09-19, ADR-HEARTH-090): completely missing from every build
      // made so far — confirmed by inspecting the compiled Info.plist directly. iOS gates ALL
      // app-initiated connections to local/private-network addresses behind this permission since
      // iOS 14; Expo Go already has it granted for itself, so every driver's direct connection to
      // a device's local IP "just worked" there and nowhere else. Without this string, iOS never
      // even shows the permission prompt, and local network requests are silently blocked —
      // almost certainly why discovery/connection behaves differently in a standalone build.
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocalNetworkUsageDescription:
          "Hearth connects directly to TVs, outlets, and other devices on your home network to control them.",
      },
      // SSDP discovery (ADR-HEARTH-095): com.apple.developer.networking.multicast REMOVED here
      //2026-09-19 after a real build failure corrected a wrong assumption — declaring this
      // entitlement before Apple approves it doesn't just make multicast silently fail at
      // runtime, it makes Xcode refuse to create a provisioning profile AT ALL ("Entitlement...
      // requires approval from Apple... Please request access... To continue building for device
      // during request processing, remove entitlement and add upon approval" — Apple's own error,
      // confirmed live). Stays out of config until Sean requests it
      // (developer.apple.com/contact/request/networking-multicast) and Apple approves it for this
      // team/bundle identifier — re-add and rebuild only after that. Android needs no such
      // approval; its CHANGE_WIFI_MULTICAST_STATE permission below is unaffected.
    },
    android: {
      package: BUNDLE_IDENTIFIER,
      adaptiveIcon: {
        backgroundColor: "#12141C",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      // CHANGE_WIFI_MULTICAST_STATE (ADR-HEARTH-095): without this, Android's WiFi chip silently
      // filters out multicast frames as a battery-saving default — SSDP responses would never
      // reach the app even with a working UDP socket. react-native-udp's MulticastSocket needs
      // this permission to actually acquire the lock that lifts that filtering.
      permissions: ["android.permission.CAMERA", "android.permission.RECORD_AUDIO", "android.permission.CHANGE_WIFI_MULTICAST_STATE"],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#12141C",
    },
    // Real bug found live (2026-09-19, ADR-HEARTH-087): expo-updates does NOT get the same
    // automatic "legacy plugin" application that expo-camera/expo-secure-store get from just being
    // installed — confirmed by downloading the actual compiled .ipa and finding zero EXUpdates*
    // keys anywhere in its Info.plist, while expo-camera's NSCameraUsageDescription was correctly
    // present. Without an explicit entry here, prebuild never wires the update-checker into the
    // native binary at all — no server-side config or OTA push can work around that; it must be a
    // real rebuild.
    plugins: [
      "expo-secure-store",
      [
        "expo-camera",
        {
          cameraPermission: "Hearth uses the camera to scan a Family Command Center QR code for easy pairing.",
        },
      ],
      "expo-web-browser",
      "expo-updates",
    ],
    // EAS Update (ADR-HEARTH-084): lets a JS-only change push directly to an already-installed
    // build with no App Store/TestFlight review and no reinstall. "appVersion" runtime policy
    // means any build sharing the current `version` above can receive these updates; bumping
    // `version` (not just the build number) is what signals "this needs a new binary, not an OTA
    // push" going forward.
    updates: {
      url: "https://u.expo.dev/55f64f3e-6b45-423c-8510-7d8ec7673992",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    extra: {
      eas: {
        projectId: "55f64f3e-6b45-423c-8510-7d8ec7673992",
      },
    },
    owner: "seangommier",
  },
};
