import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// Connection settings for the Family Command Center discovery integration
// (ADR-HEARTH-010). Split the same way persistence.ts splits device config:
// the base URL is plain connection metadata (AsyncStorage), the bearer
// token is a credential and belongs in SecureStore, never plaintext.
const BASE_URL_KEY = "hearth.fcc.baseUrl";
const TOKEN_KEY = "hearth.fcc.token";

export interface FamilyCommandCenterConfig {
  baseUrl: string;
  token: string;
}

export async function loadFamilyCommandCenterConfig(): Promise<FamilyCommandCenterConfig | null> {
  const [baseUrl, token] = await Promise.all([AsyncStorage.getItem(BASE_URL_KEY), SecureStore.getItemAsync(TOKEN_KEY)]);
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

export async function saveFamilyCommandCenterConfig(config: FamilyCommandCenterConfig): Promise<void> {
  await Promise.all([AsyncStorage.setItem(BASE_URL_KEY, config.baseUrl), SecureStore.setItemAsync(TOKEN_KEY, config.token)]);
}

export class FamilyCommandCenterVerificationError extends Error {}

/** Confirms a base URL + token actually work (a real authenticated request, not just non-empty fields) before saving — used by both the manual-entry form and QR-code pairing, so neither can save an untested config. */
export async function verifyAndSaveFamilyCommandCenterConfig(baseUrl: string, token: string): Promise<void> {
  const trimmedUrl = baseUrl.trim().replace(/\/$/, "");
  const trimmedToken = token.trim();
  if (!trimmedUrl || !trimmedToken) {
    throw new FamilyCommandCenterVerificationError("Address and token are both required.");
  }

  const response = await fetch(`${trimmedUrl}/api/integrations/hearth/devices`, {
    headers: { Authorization: `Bearer ${trimmedToken}` },
  });
  if (!response.ok) {
    throw new FamilyCommandCenterVerificationError(response.status === 401 ? "That token was rejected." : `Server returned ${response.status}.`);
  }

  await saveFamilyCommandCenterConfig({ baseUrl: trimmedUrl, token: trimmedToken });
}

export async function clearFamilyCommandCenterConfig(): Promise<void> {
  await Promise.all([AsyncStorage.removeItem(BASE_URL_KEY), SecureStore.deleteItemAsync(TOKEN_KEY)]);
}
