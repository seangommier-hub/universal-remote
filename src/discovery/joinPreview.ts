import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { candidateServers } from "./joinHousehold";
import { PairInvite } from "./pairInvite";
import { hostOf } from "./trustedServers";

export interface JoinPreview {
  /** The host the phone will contact first for this invite (already filtered by the trust rules). */
  host: string;
  /** The host of the household connection this join would replace; null when nothing is saved. */
  currentHost: string | null;
}

/** Works out, without touching the network, which host a join would contact and what it would replace (ADR-HEARTH-160). */
export async function previewJoin(invite: PairInvite): Promise<JoinPreview> {
  const [servers, saved] = await Promise.all([candidateServers(invite), loadFamilyCommandCenterConfig()]);
  return {
    host: hostOf(servers[0]) ?? servers[0],
    currentHost: saved ? hostOf(saved.baseUrl) ?? saved.baseUrl : null,
  };
}

export interface JoinConfirmation {
  title: string;
  message: string;
}

/** The plain-language wording of the dialog a person must accept before a pairing link is redeemed. */
export function buildJoinConfirmation(preview: JoinPreview): JoinConfirmation {
  const contact = `Hearth will contact ${preview.host} to join a household.`;
  if (!preview.currentHost) return { title: "Join this household?", message: contact };
  return { title: "Replace your household connection?", message: `${contact}\n\nThis will replace your current household connection (${preview.currentHost}).` };
}
