import { Platform } from "react-native";

const DEMO_ENV_VALUE = "1";
const DEMO_QUERY_PARAM = "demo";
const SCREEN_QUERY_PARAM = "screen";
const FONT_SCALE_QUERY_PARAM = "fontScale";
const MIN_FONT_SCALE = 1;
const MAX_FONT_SCALE = 3;

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

/**
 * ADR-HEARTH-180: the demo-only ?fontScale= multiplier (e.g. 1.3, 1.6), for approximating iOS
 * Dynamic Type at larger accessibility text sizes in the web verification harness — Playwright
 * has no way to emulate real Dynamic Type directly, so this scales theme.type instead (see
 * demoFontScale.ts). 1 (no scaling) outside demo mode, or when the param is absent or out of the
 * [1, 3] sanity range.
 */
export function demoFontScaleParam(): number {
  if (!isDemoMode()) return MIN_FONT_SCALE;
  const raw = Number(readWebQuery()?.get(FONT_SCALE_QUERY_PARAM));
  return Number.isFinite(raw) && raw >= MIN_FONT_SCALE && raw <= MAX_FONT_SCALE ? raw : MIN_FONT_SCALE;
}
