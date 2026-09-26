import { fetchWithTimeout } from "../core/network/fetchWithTimeout";
import { logger } from "../core/logging/logger";
import { loadFamilyCommandCenterConfig, saveFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { isTrustedPublicUrl } from "./trustedServers";

const LOG_SCOPE = "learnPublicUrl";
const CONNECTION_INFO_PATH = "/api/integrations/hearth/connection-info";

/** Silently saves the server's public address when this phone is connected but has none, so remote control needs no typing; returns whether one was saved. */
export async function learnPublicUrlIfMissing(): Promise<boolean> {
  try {
    const config = await loadFamilyCommandCenterConfig();
    if (!config || config.publicBaseUrl) return false;
    const response = await fetchWithTimeout(`${config.baseUrl}${CONNECTION_INFO_PATH}`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) return false;
    const info = (await response.json()) as { publicBaseUrl?: string | null };
    const publicBaseUrl = info.publicBaseUrl?.trim().replace(/\/$/, "");
    if (!publicBaseUrl || !isTrustedPublicUrl(publicBaseUrl, [config.baseUrl])) return false;
    await saveFamilyCommandCenterConfig({ ...config, publicBaseUrl });
    return true;
  } catch (error) {
    logger.debug(LOG_SCOPE, "Could not learn the public address", { message: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
