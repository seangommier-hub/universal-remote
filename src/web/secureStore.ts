import { activeBackend } from "./keyValueBackend";

// Web stand-in for expo-secure-store, which has no web implementation. Values live in localStorage
// (or memory in demo mode): fine for developer verification, never used by a normal native build.

const KEY_PREFIX = "secure:";

/** Reads a stored value, or null when absent. */
export async function getItemAsync(key: string): Promise<string | null> {
  return activeBackend().get(KEY_PREFIX + key);
}

/** Stores a value under the key. */
export async function setItemAsync(key: string, value: string): Promise<void> {
  activeBackend().set(KEY_PREFIX + key, value);
}

/** Deletes the key. */
export async function deleteItemAsync(key: string): Promise<void> {
  activeBackend().remove(KEY_PREFIX + key);
}
