import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "../core/logging/logger";

// ADR-HEARTH-222: which discovered devices the person has already been told about (dismissed the
// "new devices found" banner, or opened Discover). Kept on this phone only, in its own storage key
// -- not inside the device labels -- so the always-mounted indicator can never overwrite a hide
// made on the Suggested / Discover screens, and never shares a "seen" flag with the household.

export const NOTICED_STORAGE_KEY = "hearth.discover.noticed";
export const MAX_NOTICED_DEVICES = 500;
const LOG_SCOPE = "noticed-devices";

/** Device keys (MAC when known, otherwise address), oldest first. */
export type NoticedDevices = string[];

/** Reads the stored list tolerantly: anything that is not an array of strings is dropped. */
export function parseNoticed(raw: string | null): NoticedDevices {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

/** The list with these keys added once each; the oldest entries fall off past the cap. */
export function withNoticed(noticed: NoticedDevices, keys: string[]): NoticedDevices {
  const merged = Array.from(new Set([...noticed, ...keys]));
  return merged.slice(-MAX_NOTICED_DEVICES);
}

/** Loads the keys saved on this phone. */
export async function loadNoticed(): Promise<NoticedDevices> {
  try {
    return parseNoticed(await AsyncStorage.getItem(NOTICED_STORAGE_KEY));
  } catch (err) {
    logger.warn(LOG_SCOPE, "Could not read the noticed devices", { error: String(err) });
    return [];
  }
}

/** Saves the keys on this phone. */
export async function saveNoticed(noticed: NoticedDevices): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTICED_STORAGE_KEY, JSON.stringify(noticed));
  } catch (err) {
    logger.warn(LOG_SCOPE, "Could not save the noticed devices", { error: String(err) });
  }
}
