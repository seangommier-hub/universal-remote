import { KeyValueStore } from "./keyValueStore";

let store = new KeyValueStore();

/** Points the AsyncStorage stand-in at a store (e.g. a file-backed one); defaults to in-memory. */
export function useAsyncStorageBackend(backend: KeyValueStore): void {
  store = backend;
}

/** Node stand-in for @react-native-async-storage/async-storage covering the calls the app makes. */
const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => store.get(key),
  setItem: async (key: string, value: string): Promise<void> => store.set(key, value),
  removeItem: async (key: string): Promise<void> => store.remove(key),
};

export default AsyncStorage;
