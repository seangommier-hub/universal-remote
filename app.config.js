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
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
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
    plugins: [
      "expo-secure-store",
      [
        "expo-camera",
        {
          cameraPermission: "Hearth uses the camera to scan a Family Command Center QR code for easy pairing.",
        },
      ],
      "expo-web-browser",
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
