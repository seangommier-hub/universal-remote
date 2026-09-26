import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { fetchWithTimeout } from "../core/network/fetchWithTimeout";

// Connection settings for the Family Command Center discovery integration
// (ADR-HEARTH-010). Split the same way persistence.ts splits device config:
// the base URL is plain connection metadata (AsyncStorage), the bearer
// token is a credential and belongs in SecureStore, never plaintext.
const BASE_URL_KEY = "hearth.fcc.baseUrl";
const PUBLIC_BASE_URL_KEY = "hearth.fcc.publicBaseUrl";
const TOKEN_KEY = "hearth.fcc.token";

export interface FamilyCommandCenterConfig {
  baseUrl: string;
  token: string;
  /** Real ask (2026-09-21, ADR-HEARTH-123): "this should be something that can still be used even
   * when off network." Optional public URL (e.g. https://hearth-relay.carddna.app, behind a
   * Cloudflare Tunnel) that httpRelayFallback.ts/wsRelayFallback.ts fall back to only when
   * `baseUrl` (the LAN address) can't be reached at all — the expected state away from the home
   * WiFi. Plain AsyncStorage, not SecureStore: a hostname, not a credential; `token` is still the
   * only secret and is reused for both. */
  publicBaseUrl?: string;
}

export async function loadFamilyCommandCenterConfig(): Promise<FamilyCommandCenterConfig | null> {
  const [baseUrl, publicBaseUrl, token] = await Promise.all([
    AsyncStorage.getItem(BASE_URL_KEY),
    AsyncStorage.getItem(PUBLIC_BASE_URL_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);
  if (!baseUrl || !token) return null;
  return { baseUrl, token, publicBaseUrl: publicBaseUrl ?? undefined };
}

export async function saveFamilyCommandCenterConfig(config: FamilyCommandCenterConfig): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(BASE_URL_KEY, config.baseUrl),
    config.publicBaseUrl ? AsyncStorage.setItem(PUBLIC_BASE_URL_KEY, config.publicBaseUrl) : AsyncStorage.removeItem(PUBLIC_BASE_URL_KEY),
    SecureStore.setItemAsync(TOKEN_KEY, config.token),
  ]);
}

export class FamilyCommandCenterVerificationError extends Error {}

/** Confirms a base URL + token actually work (a real authenticated request, not just non-empty fields) before saving — used by both the manual-entry form and QR-code pairing, so neither can save an untested config. */
export async function verifyAndSaveFamilyCommandCenterConfig(baseUrl: string, token: string): Promise<void> {
  const trimmedUrl = baseUrl.trim().replace(/\/$/, "");
  const trimmedToken = token.trim();
  if (!trimmedUrl || !trimmedToken) {
    throw new FamilyCommandCenterVerificationError("Address and token are both required.");
  }

  await verifyReachable(trimmedUrl, trimmedToken);

  // Preserves an already-saved publicBaseUrl (e.g. re-verifying the LAN address alone shouldn't
  // silently drop the away-from-home one already configured).
  const existing = await loadFamilyCommandCenterConfig();
  await saveFamilyCommandCenterConfig({ baseUrl: trimmedUrl, token: trimmedToken, publicBaseUrl: existing?.publicBaseUrl });
}

/** Real ask (2026-09-21, ADR-HEARTH-123): "this should be something that can still be used even
 * when off network." Verifies and saves the optional public/away-from-home URL — same
 * "test before saving" contract as the LAN address, separate function since it doesn't touch
 * `token` and (unlike the LAN address) is allowed to be cleared back to unset. */
export async function verifyAndSavePublicUrl(publicBaseUrl: string): Promise<void> {
  const trimmed = publicBaseUrl.trim().replace(/\/$/, "");
  const existing = await loadFamilyCommandCenterConfig();
  if (!existing) {
    throw new FamilyCommandCenterVerificationError("Set up the LAN address and token first.");
  }
  if (trimmed) {
    await verifyReachable(trimmed, existing.token);
  }
  await saveFamilyCommandCenterConfig({ ...existing, publicBaseUrl: trimmed || undefined });
}

async function verifyReachable(baseUrl: string, token: string): Promise<void> {
  const response = await fetchWithTimeout(`${baseUrl}/api/integrations/hearth/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new FamilyCommandCenterVerificationError(response.status === 401 ? "That token was rejected." : `Server returned ${response.status}.`);
  }
}

export async function clearFamilyCommandCenterConfig(): Promise<void> {
  await Promise.all([AsyncStorage.removeItem(BASE_URL_KEY), AsyncStorage.removeItem(PUBLIC_BASE_URL_KEY), SecureStore.deleteItemAsync(TOKEN_KEY)]);
}
