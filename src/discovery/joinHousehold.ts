import { FccUnreachableError } from "../core/network/fccErrors";
import { logger } from "../core/logging/logger";
import { loadFamilyCommandCenterConfig, saveFamilyCommandCenterConfig, verifyAndSaveFamilyCommandCenterConfig, verifyAndSavePublicUrl } from "./familyCommandCenterConfig";
import { learnPublicUrlIfMissing } from "./learnPublicUrl";
import { PairInvite } from "./pairInvite";
import { PairCodeInvalidError, PairLockedOutError, redeemPairCode, RedeemedPairing } from "./pairClient";

const LOG_SCOPE = "joinHousehold";
/** The household relay every phone can reach away from home; last resort when no address was shared. */
export const DEFAULT_RELAY_URL = "https://hearth-relay.carddna.app";

function cleanUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/** Server addresses to try, in order: the link's, the saved LAN address, the saved public one, then the default relay; no duplicates. */
export async function candidateServers(invite: PairInvite): Promise<string[]> {
  const saved = await loadFamilyCommandCenterConfig();
  const ordered = [invite.server, saved?.baseUrl, saved?.publicBaseUrl, DEFAULT_RELAY_URL];
  const cleaned = ordered.filter((url): url is string => Boolean(url?.trim())).map(cleanUrl);
  return cleaned.filter((url, index) => cleaned.indexOf(url) === index);
}

/** Redeems against each candidate in turn; a definitive answer (bad code, lockout) stops the search, unreachable moves on. */
export async function redeemAgainstCandidates(code: string, servers: string[]): Promise<RedeemedPairing> {
  let lastError: unknown = new FccUnreachableError("No server address to try.");
  for (const server of servers) {
    try {
      return await redeemPairCode(server, code);
    } catch (error) {
      if (error instanceof PairCodeInvalidError || error instanceof PairLockedOutError) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function saveRedeemed(pairing: RedeemedPairing): Promise<void> {
  const publicBaseUrl = pairing.publicBaseUrl ? cleanUrl(pairing.publicBaseUrl) : undefined;
  try {
    await verifyAndSaveFamilyCommandCenterConfig(pairing.baseUrl, pairing.token);
  } catch (lanError) {
    if (!publicBaseUrl) throw lanError;
    // Away from home the LAN address is unreachable; prove the token over the public host instead.
    await verifyAndSaveFamilyCommandCenterConfig(publicBaseUrl, pairing.token);
    await saveFamilyCommandCenterConfig({ baseUrl: cleanUrl(pairing.baseUrl), token: pairing.token.trim(), publicBaseUrl });
    return;
  }
  if (publicBaseUrl) {
    await verifyAndSavePublicUrl(publicBaseUrl).catch((error) =>
      logger.warn(LOG_SCOPE, "Public address from the invite was not reachable", { message: error instanceof Error ? error.message : String(error) })
    );
  }
}

/** Redeems an invite and saves the resulting connection through the verify-and-save helpers. */
export async function joinHousehold(invite: PairInvite): Promise<void> {
  const servers = await candidateServers(invite);
  const pairing = await redeemAgainstCandidates(invite.code, servers);
  await saveRedeemed(pairing);
  await learnPublicUrlIfMissing();
  logger.info(LOG_SCOPE, "Joined household from an invite code", { baseUrl: pairing.baseUrl });
}
