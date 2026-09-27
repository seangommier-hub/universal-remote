import { HA_OAUTH_PROACTIVE_REFRESH_FRACTION } from "./haOAuthConfig";

/** Per-instance Home Assistant OAuth bookkeeping alongside the shared HaInstance (ADR-HEARTH-190): the current access token already lives as HaInstance.token; this is the rest. */
export interface HaOAuthState {
  instanceId: string;
  refreshToken: string;
  issuedAt: number;
  expiresAt: number;
  /** Set when a refresh has been permanently rejected (invalid_grant); cleared by a fresh sign-in. */
  needsSignIn: boolean;
}

/**
 * Milliseconds until the access token should be proactively refreshed (0 or negative means overdue — refresh
 * immediately). The fixed fraction applies to the token's own lifetime (issuedAt..expiresAt), so it gives the
 * same answer right after a token is issued and after the app was closed and reopened.
 */
export function msUntilProactiveRefresh(state: Pick<HaOAuthState, "issuedAt" | "expiresAt">, now: number = Date.now()): number {
  const lifetimeMs = state.expiresAt - state.issuedAt;
  const refreshAt = state.issuedAt + lifetimeMs * HA_OAUTH_PROACTIVE_REFRESH_FRACTION;
  return refreshAt - now;
}
