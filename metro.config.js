const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// ADR-HEARTH-157: web-only (and demo-build-only) stand-ins for modules that cannot run in a browser.
// A normal iOS/Android build never matches any alias below, so native bundles are unchanged.
const config = getDefaultConfig(__dirname);
const WEB_DIR = path.join(__dirname, "src", "web");
const DEMO_BUILD = process.env.EXPO_PUBLIC_DEMO === "1";

const WEB_ALIASES = {
  "expo-secure-store": path.join(WEB_DIR, "secureStore.ts"),
  "react-native-udp": path.join(WEB_DIR, "emptyModule.ts"),
  "@react-native-async-storage/async-storage": path.join(WEB_DIR, "asyncStorage.ts"),
};
const DEMO_NATIVE_ALIASES = {
  "expo-secure-store": WEB_ALIASES["expo-secure-store"],
  "@react-native-async-storage/async-storage": WEB_ALIASES["@react-native-async-storage/async-storage"],
};

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const aliases = platform === "web" ? WEB_ALIASES : DEMO_BUILD ? DEMO_NATIVE_ALIASES : null;
  const target = aliases && aliases[moduleName];
  if (target) return { type: "sourceFile", filePath: target };
  return (defaultResolve || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
