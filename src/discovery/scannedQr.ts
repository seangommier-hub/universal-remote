import { PairInvite, parsePairInput, PAIR_LINK_PREFIX } from "./pairInvite";

// ADR-HEARTH-167: the QR scanner used to accept only Family Command Center's own settings QR
// (JSON with baseUrl + token). It now also accepts a household invite (a hearth://pair link, the
// same thing an invite shares), so "scan the code someone showed me" works from any scan entry.

export type ScannedQr = { kind: "settings"; baseUrl: string; token: string } | { kind: "invite"; invite: PairInvite };

function parseSettingsPayload(raw: string): ScannedQr | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { baseUrl, token } = parsed as Record<string, unknown>;
    return typeof baseUrl === "string" && typeof token === "string" ? { kind: "settings", baseUrl, token } : null;
  } catch {
    return null;
  }
}

/** Reads what a scanned QR holds: a settings payload, a pairing invite link, or null when it is neither. */
export function interpretScannedQr(raw: string): ScannedQr | null {
  const text = raw.trim();
  if (text.toLowerCase().startsWith(PAIR_LINK_PREFIX)) {
    const invite = parsePairInput(text);
    return invite ? { kind: "invite", invite } : null;
  }
  return parseSettingsPayload(text);
}
