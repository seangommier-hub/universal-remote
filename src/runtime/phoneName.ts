import { Platform } from "react-native";
import { loadMemberName, saveMemberName } from "./activityPersistence";

// ADR-HEARTH-170: the name this phone goes by in the household log. It is the same value the
// Activities editor already calls "your name" (one name per phone). Read synchronously at command
// time from a cache filled once at startup, so recording never waits on storage.

const IOS_DEFAULT_NAME = "Someone's iPhone";
const OTHER_DEFAULT_NAME = "Someone's phone";

let cachedName: string | undefined;

/** What the log calls this phone until its owner sets a name; iOS 16+ hides the real device name from apps, so it is generic. */
export function defaultPhoneName(): string {
  return Platform.OS === "ios" ? IOS_DEFAULT_NAME : OTHER_DEFAULT_NAME;
}

/** Loads the saved name into the cache; resolves with the name in effect. */
export async function initPhoneName(): Promise<string> {
  cachedName = (await loadMemberName())?.trim() || undefined;
  return getPhoneName();
}

/** The name in effect right now (saved name, else the default). */
export function getPhoneName(): string {
  return cachedName ?? defaultPhoneName();
}

/** The saved name only, or "" when none is set (used to show the default as a placeholder). */
export function getSavedPhoneName(): string {
  return cachedName ?? "";
}

/** Saves the name and updates the cache immediately; an empty name goes back to the default. */
export async function setPhoneName(name: string): Promise<void> {
  cachedName = name.trim() || undefined;
  await saveMemberName(name);
}
