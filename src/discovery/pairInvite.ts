// Pure helpers for household invite codes (ADR-HEARTH-149): normalizing what a person types or
// pastes, parsing hearth://pair links, and building the link an invite shares.

export const PAIR_CODE_LENGTH = 8;
export const PAIR_LINK_PREFIX = "hearth://pair";

const NON_ALPHANUMERIC = /[^A-Za-z0-9]/g;
const LINK_SCHEME_PATTERN = /^hearth:\/\//i;

export interface PairInvite {
  code: string;
  /** Address to redeem against, when the pasted link carried one. */
  server?: string;
}

/** Uppercases a typed code and strips spaces, dashes and any other punctuation. */
export function normalizePairCode(raw: string): string {
  return raw.replace(NON_ALPHANUMERIC, "").toUpperCase();
}

function readQueryParam(text: string, name: string): string | undefined {
  const match = new RegExp(`[?&]${name}=([^&#]*)`, "i").exec(text);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

/** Reads a bare code or a hearth://pair?code=...&server=... link; returns null when no complete code is present. */
export function parsePairInput(raw: string): PairInvite | null {
  const text = raw.trim();
  if (!text) return null;
  if (LINK_SCHEME_PATTERN.test(text)) {
    const code = normalizePairCode(readQueryParam(text, "code") ?? "");
    if (code.length !== PAIR_CODE_LENGTH) return null;
    const server = readQueryParam(text, "server")?.trim();
    return { code, server: server || undefined };
  }
  const code = normalizePairCode(text);
  return code.length === PAIR_CODE_LENGTH ? { code } : null;
}

/** Builds the shareable link for an invite. */
export function buildPairLink(code: string, server: string): string {
  return `${PAIR_LINK_PREFIX}?code=${encodeURIComponent(code)}&server=${encodeURIComponent(server)}`;
}
