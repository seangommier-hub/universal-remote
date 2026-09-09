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

export async function clearFamilyCommandCenterConfig(): Promise<void> {
  await Promise.all([AsyncStorage.removeItem(BASE_URL_KEY), SecureStore.deleteItemAsync(TOKEN_KEY)]);
}
