import type { FamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";
import { FccUnreachableError } from "./fccErrors";
import { FccRoute, recordLanFailure, recordRouteSuccess, shouldPreferPublicRoute } from "./fccConnectivity";
import { DEFAULT_FETCH_TIMEOUT_MS, FetchTimeoutError, fetchWithTimeout } from "./fetchWithTimeout";

// The single client for every direct call to Family Command Center (ADR-HEARTH-147). It tries the
// LAN address, then the public tunnel address, but only when the failure is "could not reach" (no
// route, timeout). Any HTTP response, including 401/4xx/5xx, is returned to the caller untouched and
// never falls through to the other address, since retrying elsewhere would only mask a real rejection.

interface Attempt {
  route: FccRoute;
  baseUrl: string;
}

function orderAttempts(config: FamilyCommandCenterConfig): Attempt[] {
  const lan: Attempt = { route: "lan", baseUrl: config.baseUrl };
  if (!config.publicBaseUrl) return [lan];
  const publicAttempt: Attempt = { route: "public", baseUrl: config.publicBaseUrl };
  return shouldPreferPublicRoute() ? [publicAttempt, lan] : [lan, publicAttempt];
}

function describeFailure(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** True when an unreachable failure was a timeout rather than an immediate network error. */
export function isFccTimeout(err: unknown): boolean {
  const cause = err instanceof FccUnreachableError ? err.cause : err;
  return cause instanceof FetchTimeoutError || (cause instanceof Error && cause.name === "AbortError");
}

/** Sends an authenticated request to Family Command Center, LAN first then the public tunnel; resolves with the raw Response, rejects with FccUnreachableError only if no address could be reached. */
export async function fccFetch(
  config: FamilyCommandCenterConfig,
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const request: RequestInit = {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${config.token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  };
  let lastError: unknown;
  for (const { route, baseUrl } of orderAttempts(config)) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}${path}`, request, timeoutMs);
      recordRouteSuccess(route);
      return response;
    } catch (err) {
      if (init.signal?.aborted) throw err;
      if (route === "lan") recordLanFailure();
      lastError = err;
    }
  }
  throw new FccUnreachableError(describeFailure(lastError), { cause: lastError });
}
