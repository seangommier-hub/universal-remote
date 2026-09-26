import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "../core/logging/logger";

const STORAGE_KEY = "hearth.wakeTested";
const LOG_SCOPE = "WakeTestStore";

/** Kept apart from the persisted Device shape on purpose (ADR-HEARTH-154). */
export interface WakeTestRecord {
  testedAt: number;
  seconds: number;
}

export type WakeTestRecords = Record<string, WakeTestRecord>;

/** Parses the stored JSON map defensively; anything malformed reads as empty. */
export function parseWakeTestRecords(raw: string | null): WakeTestRecords {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as WakeTestRecords) : {};
  } catch {
    return {};
  }
}

/** Every device's last successful wake test, keyed by device id. */
export async function loadWakeTestRecords(): Promise<WakeTestRecords> {
  return parseWakeTestRecords(await AsyncStorage.getItem(STORAGE_KEY));
}

/** Remembers that a device woke successfully, so a tick can be shown later. */
export async function recordWakeSuccess(deviceId: string, seconds: number, now: number = Date.now()): Promise<void> {
  try {
    const records = await loadWakeTestRecords();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...records, [deviceId]: { testedAt: now, seconds } }));
  } catch (err) {
    logger.warn(LOG_SCOPE, "Could not save the wake test result", { message: err instanceof Error ? err.message : String(err) });
  }
}
