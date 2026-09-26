import { fetchWithTimeout } from "../core/network/fetchWithTimeout";
import { FccUnreachableError } from "../core/network/fccErrors";

// Client for the household invite endpoints on Family Command Center (ADR-HEARTH-149).

const CODE_PATH = "/api/integrations/hearth/pair/code";
const REDEEM_PATH = "/api/integrations/hearth/pair/redeem";
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;

/** The code was wrong, expired, or already used (the server does not say which). */
export class PairCodeInvalidError extends Error {}

/** Too many wrong tries; the server is refusing codes for a while. */
export class PairLockedOutError extends Error {}

export interface CreatedInvite {
  code: string;
  expiresAt: string;
  publicBaseUrl: string | null;
  baseUrl: string;
}

export interface RedeemedPairing {
  baseUrl: string;
  publicBaseUrl: string | null;
  token: string;
}

function trimTrailingSlash(url: string): string {
  return url.trim().replace(/\/$/, "");
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init);
  } catch (error) {
    throw new FccUnreachableError(error instanceof Error ? error.message : String(error));
  }
}

/** Asks the server (with the saved token) for a fresh single-use invite code. */
export async function createPairInvite(baseUrl: string, token: string): Promise<CreatedInvite> {
  const response = await send(`${trimTrailingSlash(baseUrl)}${CODE_PATH}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}.`);
  return (await response.json()) as CreatedInvite;
}

/** Trades a code for the household's address and token; sends no credentials. */
export async function redeemPairCode(serverUrl: string, code: string): Promise<RedeemedPairing> {
  const response = await send(`${trimTrailingSlash(serverUrl)}${REDEEM_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (response.status === HTTP_TOO_MANY_REQUESTS) throw new PairLockedOutError("Locked out");
  if (response.status === HTTP_BAD_REQUEST) throw new PairCodeInvalidError("Invalid code");
  if (!response.ok) throw new Error(`Server returned ${response.status}.`);
  return (await response.json()) as RedeemedPairing;
}
