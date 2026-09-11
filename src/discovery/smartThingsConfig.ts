import * as SecureStore from "expo-secure-store";

// OAuth tokens for the SmartThings integration (smart outlets/plugs — Sean's ask, 2026-09-11:
// "start thinking about and wiring up amazon alexa for the smart outlets... this should be
// something that is sso and easy for the user"). Amazon's Alexa platform has no public API for a
// third-party app to control devices a user has already connected to their own Alexa account —
// confirmed in docs/DEVICE_FEASIBILITY.md, sourced directly from Amazon's own developer docs.
// SmartThings is what actually delivers "SSO and easy": OAuth2 login (no bridge IP or token to
// type, unlike Hue), and it already aggregates a broad range of third-party outlet/plug brands
// behind one consistent API — a user adds a device once in the SmartThings app (which already
// has the "add anything with a few clicks" experience Sean wants) and Hearth just reads whatever
// is already there via their SmartThings login.
//
// Unlike familyCommandCenterConfig.ts's baseUrl+token split, every field here is a credential —
// all in SecureStore, nothing in plaintext AsyncStorage. `refreshToken` is the long-lived
// credential; `accessToken`/`expiresAt` are short-lived and refreshed automatically by
// SmartThingsClient rather than requiring the user to re-authenticate.
const ACCESS_TOKEN_KEY = "hearth.smartthings.accessToken";
const REFRESH_TOKEN_KEY = "hearth.smartthings.refreshToken";
const EXPIRES_AT_KEY = "hearth.smartthings.expiresAt";

export interface SmartThingsConfig {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when accessToken expires — SmartThingsClient refreshes proactively before this, not reactively after a 401. */
  expiresAt: number;
}

export async function loadSmartThingsConfig(): Promise<SmartThingsConfig | null> {
  const [accessToken, refreshToken, expiresAtRaw] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(EXPIRES_AT_KEY),
  ]);
  if (!accessToken || !refreshToken || !expiresAtRaw) return null;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return null;
  return { accessToken, refreshToken, expiresAt };
}

export async function saveSmartThingsConfig(config: SmartThingsConfig): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, config.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, config.refreshToken),
    SecureStore.setItemAsync(EXPIRES_AT_KEY, String(config.expiresAt)),
  ]);
}

export async function clearSmartThingsConfig(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY), SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY), SecureStore.deleteItemAsync(EXPIRES_AT_KEY)]);
}
