import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "../core/logging/logger";
import { cleanReportedName, NameSourceKind } from "./deviceIdentity";

// ADR-HEARTH-156: remembers whether a saved name was typed by the person ("user") or came from the
// device / network ("device", "friendly", ...). Kept in its own AsyncStorage map, not on the Device.
// The rename suggestion only ever appears for names the person did not type.

export const NAME_SOURCE_STORAGE_KEY = "hearth.deviceNameSource";
const LOG_SCOPE = "device-name-source";

export type NameSourceMap = Record<string, NameSourceKind>;

/** Reads the stored map tolerantly, dropping anything that is not a string value. */
export function parseNameSources(raw: string | null): NameSourceMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string")) as NameSourceMap;
  } catch {
    return {};
  }
}

/** Loads the name-source map saved on this phone. */
export async function loadNameSources(): Promise<NameSourceMap> {
  try {
    return parseNameSources(await AsyncStorage.getItem(NAME_SOURCE_STORAGE_KEY));
  } catch (error) {
    logger.warn(LOG_SCOPE, "could not read name sources", { message: String(error) });
    return {};
  }
}

/** Records where one device's saved name came from. */
export async function setNameSource(deviceId: string, source: NameSourceKind): Promise<void> {
  try {
    const current = await loadNameSources();
    await AsyncStorage.setItem(NAME_SOURCE_STORAGE_KEY, JSON.stringify({ ...current, [deviceId]: source }));
  } catch (error) {
    logger.warn(LOG_SCOPE, "could not save name source", { message: String(error) });
  }
}

/** The name the device now reports, if it differs from the saved one and the person never renamed it in Hearth; otherwise null. */
export function suggestDeviceName(storedName: string, reportedName: string | null | undefined, source: NameSourceKind | undefined): string | null {
  if (source === undefined || source === "user") return null;
  const reported = cleanReportedName(reportedName);
  if (!reported) return null;
  return reported.toLowerCase() === storedName.trim().toLowerCase() ? null : reported;
}
