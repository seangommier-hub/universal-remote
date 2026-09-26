import { KeyValueStore } from "./keyValueStore";

let store = new KeyValueStore();

/** Points the SecureStore stand-in at a store; production use should pass an owner-only file. */
export function useSecureStoreBackend(backend: KeyValueStore): void {
  store = backend;
}

/** Node stand-in for expo-secure-store: same async API, backed by an owner-only file instead of the iOS keychain. */
export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.remove(key);
}
