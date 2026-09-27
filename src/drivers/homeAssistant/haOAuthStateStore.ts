import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { logger } from "../../core/logging/logger";
import { HaOAuthState } from "./haOAuthState";
import { setHaOAuthState } from "./haOAuthStateRegistry";

const LOG_SCOPE = "haOAuthStateStore";
// {instanceId: {issuedAt, expiresAt, needsSignIn}} only — no secret, so this is plain storage like haInstanceStore's address list.
const METADATA_KEY = "hearth.haOAuthStates.v1";

interface StoredMetadata {
  issuedAt: number;
  expiresAt: number;
  needsSignIn: boolean;
}

function refreshTokenKey(instanceId: string): string {
  return `hearth.ha.instance.${instanceId.replace(/[^a-zA-Z0-9._-]/g, "-")}.oauthRefreshToken`;
}

async function readMetadata(): Promise<Record<string, StoredMetadata>> {
  const raw = await AsyncStorage.getItem(METADATA_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, StoredMetadata>) : {};
  } catch {
    return {};
  }
}

/** Persists an OAuth instance's refresh token (secure storage) and expiry/sign-in bookkeeping (plain storage), and updates the in-memory registry. */
export async function saveHaOAuthState(state: HaOAuthState): Promise<void> {
  await SecureStore.setItemAsync(refreshTokenKey(state.instanceId), state.refreshToken);
  const metadata = await readMetadata();
  metadata[state.instanceId] = { issuedAt: state.issuedAt, expiresAt: state.expiresAt, needsSignIn: state.needsSignIn };
  await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
  setHaOAuthState(state);
}

/** Loads every saved OAuth instance's state (refresh token rehydrated from secure storage) into the in-memory registry at startup; a failure on one instance is logged and leaves the rest usable. */
export async function hydrateHaOAuthStates(): Promise<HaOAuthState[]> {
  const metadata = await readMetadata();
  const loaded: HaOAuthState[] = [];
  for (const [instanceId, meta] of Object.entries(metadata)) {
    try {
      const refreshToken = await SecureStore.getItemAsync(refreshTokenKey(instanceId));
      if (!refreshToken) continue;
      const state: HaOAuthState = { instanceId, refreshToken, ...meta };
      setHaOAuthState(state);
      loaded.push(state);
    } catch (error) {
      logger.warn(LOG_SCOPE, "could not read a saved Home Assistant OAuth refresh token", { instanceId, error: String(error) });
    }
  }
  return loaded;
}

/** Removes an instance's OAuth bookkeeping entirely (e.g. it was replaced by a pasted long-lived token instead). */
export async function clearHaOAuthState(instanceId: string): Promise<void> {
  await SecureStore.deleteItemAsync(refreshTokenKey(instanceId)).catch(() => undefined);
  const metadata = await readMetadata();
  delete metadata[instanceId];
  await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
}
