import { FccUnreachableError } from "../core/network/fccErrors";
import { logger } from "../core/logging/logger";
import { FamilyCommandCenterConfig, loadFamilyCommandCenterConfig, saveFamilyCommandCenterConfig, verifyAndSaveFamilyCommandCenterConfig, verifyAndSavePublicUrl } from "./familyCommandCenterConfig";
import { hostOf, sanitizeLinkServer } from "./trustedServers";
import { learnPublicUrlIfMissing } from "./learnPublicUrl";
import { PairInvite } from "./pairInvite";
import { PairCodeInvalidError, PairLockedOutError, redeemPairCode, RedeemedPairing } from "./pairClient";

const LOG_SCOPE = "joinHousehold";
/** The household relay every phone can reach away from home; last resort when no address was shared. */
export const DEFAULT_RELAY_URL = "https://hearth-relay.carddna.app";

function cleanUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/** The addresses of the saved household server, empty when this phone has none. */
export function savedServerUrls(saved: FamilyCommandCenterConfig | null): string[] {
  return [saved?.baseUrl, saved?.publicBaseUrl].filter((url): url is string => Boolean(url));
}

/** Server addresses to try, in order: the link's (only if trusted), the saved LAN address, the saved public one, then the default relay; no duplicates. */
export async function candidateServers(invite: PairInvite): Promise<string[]> {
  const saved = await loadFamilyCommandCenterConfig();
  const linkServer = sanitizeLinkServer(invite.server, savedServerUrls(saved));
  const ordered = [linkServer, saved?.baseUrl, saved?.publicBaseUrl, DEFAULT_RELAY_URL];
  const cleaned = ordered.filter((url): url is string => Boolean(url?.trim())).map(cleanUrl);
  return cleaned.filter((url, index) => cleaned.indexOf(url) === index);
}

/** Redeems against each candidate in turn; a definitive answer (bad code, lockout) stops the search, unreachable moves on. */
export async function redeemAgainstCandidates(code: string, servers: string[], savedUrls: readonly string[] = []): Promise<RedeemedPairing> {
  let lastError: unknown = new FccUnreachableError("No server address to try.");
  for (const server of servers) {
    try {
      return await redeemPairCode(server, code, savedUrls);
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

export type JoinResult = { status: "joined" } | { status: "would-replace"; currentHost: string };

export interface JoinOptions {
  /** Set only after the person tapped the dialog that says the current household connection will be replaced. */
  confirmedReplace?: boolean;
}

/** Redeems an invite and saves the connection; refuses with "would-replace" (touching nothing) when a household is already saved and the replacement wasn't confirmed. */
export async function joinHousehold(invite: PairInvite, options: JoinOptions = {}): Promise<JoinResult> {
  const saved = await loadFamilyCommandCenterConfig();
  if (saved && !options.confirmedReplace) return { status: "would-replace", currentHost: hostOf(saved.baseUrl) ?? saved.baseUrl };
  const savedUrls = savedServerUrls(saved);
  const servers = await candidateServers(invite);
  const pairing = await redeemAgainstCandidates(invite.code, servers, savedUrls);
  await saveRedeemed(pairing);
  await learnPublicUrlIfMissing();
  logger.info(LOG_SCOPE, "Joined household from an invite code", { baseUrl: pairing.baseUrl });
  return { status: "joined" };
}
