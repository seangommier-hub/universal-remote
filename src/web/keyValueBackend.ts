import { isDemoMode } from "../demo/demoMode";

/** Minimal synchronous key-value contract shared by the web AsyncStorage and SecureStore stand-ins. */
export interface KeyValueBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const memory = new Map<string, string>();

/** In-memory backend that demo mode always uses so fixtures never reach any real storage. */
export const memoryBackend: KeyValueBackend = {
  get: (key) => memory.get(key) ?? null,
  set: (key, value) => void memory.set(key, value),
  remove: (key) => void memory.delete(key),
};

const localStorageBackend: KeyValueBackend = {
  get: (key) => globalThis.localStorage.getItem(key),
  set: (key, value) => globalThis.localStorage.setItem(key, value),
  remove: (key) => globalThis.localStorage.removeItem(key),
};

function hasLocalStorage(): boolean {
  try {
    return typeof globalThis.localStorage !== "undefined" && globalThis.localStorage !== null;
  } catch {
    return false;
  }
}

/** Picks memory in demo mode or when localStorage is unavailable, otherwise the browser's localStorage. */
export function activeBackend(): KeyValueBackend {
  return isDemoMode() || !hasLocalStorage() ? memoryBackend : localStorageBackend;
}
