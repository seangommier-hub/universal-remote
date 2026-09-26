import { Platform } from "react-native";

const DEMO_ENV_VALUE = "1";
const DEMO_QUERY_PARAM = "demo";
const SCREEN_QUERY_PARAM = "screen";

function readWebQuery(): URLSearchParams | null {
  if (Platform.OS !== "web" || typeof window === "undefined" || !window.location) return null;
  return new URLSearchParams(window.location.search);
}

/** True only when the build set EXPO_PUBLIC_DEMO=1 or, on web, the URL carries ?demo=1; a production or preview build never satisfies either. */
export function isDemoMode(): boolean {
  if (process.env.EXPO_PUBLIC_DEMO === DEMO_ENV_VALUE) return true;
  return readWebQuery()?.get(DEMO_QUERY_PARAM) === DEMO_ENV_VALUE;
}

/** The demo-only ?screen= deep-entry value (for example "remote:lg"), or null when absent or not in demo mode. */
export function demoScreenParam(): string | null {
  if (!isDemoMode()) return null;
  return readWebQuery()?.get(SCREEN_QUERY_PARAM) ?? null;
}
