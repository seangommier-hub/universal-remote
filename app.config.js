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
    version: "1.0.0",
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
      permissions: ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"],
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
