import type { RedeemedPairing } from "./pairClient";
import { isTrustedPublicUrl, isTrustedServerUrl } from "./trustedServers";

// Strict validation of what a server answers when a pairing code is redeemed (ADR-HEARTH-160): the
// answer decides which address and token this phone saves, so it is never taken on trust.

export const MAX_REDEEM_RESPONSE_CHARS = 4096;
const MAX_TOKEN_LENGTH = 512;

/** The server's redeem answer was oversized, malformed, or pointed somewhere untrusted. */
export class PairResponseRejectedError extends Error {}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new PairResponseRejectedError("Redeem answer was not an object.");
  return value as Record<string, unknown>;
}

/** Reads a response body as JSON, refusing anything over the size cap. */
export async function readBoundedJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > MAX_REDEEM_RESPONSE_CHARS) throw new PairResponseRejectedError("Redeem answer was too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new PairResponseRejectedError("Redeem answer was not valid JSON.");
  }
}

/** Checks the shape and host rules of a redeem answer; throws PairResponseRejectedError unless every field passes. */
export function validateRedeemedPairing(raw: unknown, savedUrls: readonly string[]): RedeemedPairing {
  const { baseUrl, publicBaseUrl, token } = asRecord(raw);
  if (typeof token !== "string" || token.trim().length === 0 || token.length > MAX_TOKEN_LENGTH) throw new PairResponseRejectedError("Redeem answer had no usable token.");
  if (typeof baseUrl !== "string" || !isTrustedServerUrl(baseUrl, savedUrls)) throw new PairResponseRejectedError("Redeem answer pointed at an untrusted address.");
  if (publicBaseUrl === undefined || publicBaseUrl === null) return { baseUrl, publicBaseUrl: null, token };
  if (typeof publicBaseUrl !== "string" || !isTrustedPublicUrl(publicBaseUrl, savedUrls)) throw new PairResponseRejectedError("Redeem answer pointed at an untrusted public address.");
  return { baseUrl, publicBaseUrl, token };
}
