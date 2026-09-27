import { fetchWithTimeout } from "../core/network/fetchWithTimeout";
import { FccUnreachableError } from "../core/network/fccErrors";
import { getPhoneName } from "../runtime/phoneName";
import { readBoundedJson, validateRedeemedPairing } from "./redeemResponse";

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

/** Asks the server (with the saved token) for a fresh single-use invite code. Passing `guestHours`
 * (ADR-HEARTH-189, phase 2) asks for a GUEST invite instead of an ordinary one -- owner-gated on
 * the server, so this throws a plain "Server returned 403" for a non-owner caller, same as any
 * other rejected status here. Omitting it keeps this function's exact phase-1 behavior. */
export async function createPairInvite(baseUrl: string, token: string, guestHours?: number): Promise<CreatedInvite> {
  const response = await send(`${trimTrailingSlash(baseUrl)}${CODE_PATH}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, ...(guestHours ? { "Content-Type": "application/json" } : {}) },
    body: guestHours ? JSON.stringify({ role: "guest", guestHours }) : undefined,
  });
  if (!response.ok) throw new Error(`Server returned ${response.status}.`);
  return (await response.json()) as CreatedInvite;
}

/** Trades a code for the household's address and a fresh PERSONAL token for this phone (ADR-HEARTH-181, phase 1); sends no credentials, and rejects any answer that points at an untrusted host. Sends this phone's own name (already used to attribute activity-log entries) so the household's token admin list can show whose token is whose. */
export async function redeemPairCode(serverUrl: string, code: string, savedUrls: readonly string[] = []): Promise<RedeemedPairing> {
  const response = await send(`${trimTrailingSlash(serverUrl)}${REDEEM_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, phoneName: getPhoneName() }),
  });
  if (response.status === HTTP_TOO_MANY_REQUESTS) throw new PairLockedOutError("Locked out");
  if (response.status === HTTP_BAD_REQUEST) throw new PairCodeInvalidError("Invalid code");
  if (!response.ok) throw new Error(`Server returned ${response.status}.`);
  return validateRedeemedPairing(await readBoundedJson(response), savedUrls);
}
