import AsyncStorage from "@react-native-async-storage/async-storage";

const RECENT_APPS_STORAGE_KEY = "hearth.recentApps";
// Real-hardware/competitive research (2026-09-16, ADR-HEARTH-076): Roku's own official app touts
// "quickly launch your most recent channels," and a community writeup on Roku remote apps flagged
// its removal in one release as making channel-finding "a crapshoot with hours of searching" —
// this cap is a deliberate, small "most recent" list, not a full launch history.
const MAX_RECENT_APPS = 6;

/** Per-device list of recently-launched app ids, most-recent-first. No SecureStore split needed (unlike persistence.ts's device config) — an app id is not a credential. */
type RecentAppsStore = Record<string, string[]>;

async function loadStore(): Promise<RecentAppsStore> {
  const raw = await AsyncStorage.getItem(RECENT_APPS_STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as RecentAppsStore;
  } catch {
    return {};
  }
}

/** The given device's recently-launched app ids, most-recent-first. Empty for a device that's never launched anything (or was never asked to persist it). */
export async function loadRecentApps(deviceId: string): Promise<string[]> {
  const store = await loadStore();
  return store[deviceId] ?? [];
}

/** Moves `appId` to the front of the device's recent list (deduping any earlier occurrence), capped at MAX_RECENT_APPS. */
export async function recordAppLaunch(deviceId: string, appId: string): Promise<void> {
  const store = await loadStore();
  const existing = store[deviceId] ?? [];
  const next = [appId, ...existing.filter((id) => id !== appId)].slice(0, MAX_RECENT_APPS);
  store[deviceId] = next;
  await AsyncStorage.setItem(RECENT_APPS_STORAGE_KEY, JSON.stringify(store));
}
