import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultKidModeSettings, KidModeSettings, normalizeKidModeSettings } from "../core/kidMode/kidModeSettings";
import { logger } from "../core/logging/logger";

// ADR-HEARTH-176: this phone's kid-mode settings, saved locally and cached so command attribution
// (which must not wait on storage) can ask "is kid mode on?" synchronously.

const LOG_SCOPE = "kidModeState";
const KID_MODE_KEY = "hearth.kidMode.v1";

let cached: KidModeSettings = defaultKidModeSettings();
const listeners = new Set<(settings: KidModeSettings) => void>();

/** Loads the saved settings into the cache; a missing or damaged record means off. */
export async function initKidMode(): Promise<KidModeSettings> {
  try {
    const raw = await AsyncStorage.getItem(KID_MODE_KEY);
    cached = raw ? normalizeKidModeSettings(JSON.parse(raw)) : defaultKidModeSettings();
  } catch (error) {
    logger.warn(LOG_SCOPE, "could not read kid mode settings, treating as off", { error: String(error) });
    cached = defaultKidModeSettings();
  }
  return cached;
}

/** The settings in effect right now. */
export function getKidModeSettings(): KidModeSettings {
  return cached;
}

/** Whether this phone is in kid mode right now. */
export function isKidModeActive(): boolean {
  return cached.enabled;
}

/** Replaces the settings, updates the cache at once, saves, and tells subscribers. */
export async function setKidModeSettings(next: KidModeSettings): Promise<void> {
  cached = next;
  listeners.forEach((listener) => listener(next));
  await AsyncStorage.setItem(KID_MODE_KEY, JSON.stringify(next));
}

/** Calls `listener` whenever the settings change; returns an unsubscribe function. */
export function subscribeKidMode(listener: (settings: KidModeSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Demo and test only: puts settings in the cache without saving. */
export function seedKidModeForDemo(settings: KidModeSettings): void {
  cached = settings;
}
