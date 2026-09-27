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

// ADR-HEARTH-179: the LAN address's reachability right now is never confirmed-fresh outside the
// AWAY case's own 5-minute window (shouldPreferPublicRoute/AWAY_MEMORY_MS in fccConnectivity.ts) —
// a stale "home" mode, or "unknown" at cold start, both put the LAN attempt first purely as a
// default assumption, not because anything just proved it reachable. A LAN address that's actually
// gone dead (the phone just left the house, or Family Command Center is off) used to pay the
// caller's FULL timeout budget (8s for every relay-routed command, per ADR-HEARTH-141's
// RELAY_TIMEOUT_MS) before falling back to the public tunnel — on every such command, and again
// every time the away-mode memory expires and re-probes the LAN. A real, working LAN response is
// fast on a home network (well under a second, ADR-HEARTH-137) — 2.5s is generous headroom for that
// case while failing a genuinely dead LAN hop far sooner.
//
// Only ever applied to the LAN hop, and only when there's actually a public fallback to catch it:
// a household with no public tunnel configured (config.publicBaseUrl unset) has exactly one attempt
// and it keeps the full requested budget unchanged (nothing to fall back to — cutting it short
// would only turn a slow-but-working request into a false failure, the exact risk this ADR's own
// research flagged). Likewise the LAST attempt in any ordering always keeps the full budget, so the
// public tunnel is never shortened even when it's the fallback, and a same-attempt-twice edge case
// (public preferred while away, LAN as the last-resort re-probe) never gets cut short either — only
// a LAN attempt with a real, not-yet-tried fallback after it is ever shortened.
const LAN_FIRST_HOP_TIMEOUT_MS = 2500;

function attemptTimeoutMs(route: FccRoute, isLastAttempt: boolean, requestedTimeoutMs: number): number {
  if (route === "public" || isLastAttempt) return requestedTimeoutMs;
  return Math.min(LAN_FIRST_HOP_TIMEOUT_MS, requestedTimeoutMs);
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
  const attempts = orderAttempts(config);
  for (const [index, { route, baseUrl }] of attempts.entries()) {
    const isLastAttempt = index === attempts.length - 1;
    try {
      const response = await fetchWithTimeout(`${baseUrl}${path}`, request, attemptTimeoutMs(route, isLastAttempt, timeoutMs));
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
