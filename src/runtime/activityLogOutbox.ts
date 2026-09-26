import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityLogEntry } from "../core/activityLog/activityLogEntry";
import { logger } from "../core/logging/logger";

// ADR-HEARTH-170: the not-yet-delivered log entries survive an app restart, so an evening spent
// off the home network is not lost when the app is closed.

const LOG_SCOPE = "activityLogOutbox";
const OUTBOX_KEY = "hearth.activityLog.outbox.v1";

function isEntry(value: unknown): value is ActivityLogEntry {
  const entry = value as Partial<ActivityLogEntry> | null;
  return (
    !!entry &&
    typeof entry.id === "string" &&
    typeof entry.deviceId === "string" &&
    typeof entry.deviceName === "string" &&
    typeof entry.verb === "string" &&
    typeof entry.ok === "boolean" &&
    typeof entry.at === "string" &&
    typeof entry.who === "string"
  );
}

/** Loads the saved outbox; anything unreadable is ignored rather than trusted. */
export async function loadOutbox(): Promise<ActivityLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch (err) {
    logger.debug(LOG_SCOPE, "could not read the outbox", { message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/** Saves the outbox without blocking the caller; failures are logged, not thrown. */
export function saveOutbox(entries: readonly ActivityLogEntry[]): void {
  AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(entries)).catch((err) =>
    logger.debug(LOG_SCOPE, "could not save the outbox", { message: err instanceof Error ? err.message : String(err) })
  );
}
