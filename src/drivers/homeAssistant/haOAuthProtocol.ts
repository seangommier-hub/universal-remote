import { fetchWithTimeout } from "../../core/network/fetchWithTimeout";
import { HA_OAUTH_CLIENT_ID_URL, HA_OAUTH_REDIRECT_URI } from "./haOAuthConfig";
import { normalizeHomeAssistantUrl } from "./HomeAssistantClient";

const HA_TOKEN_REQUEST_TIMEOUT_MS = 15_000;

/** One access/refresh token pair from Home Assistant's /auth/token endpoint. */
export interface HaOAuthTokens {
  accessToken: string;
  refreshToken: string;
  /** When the access token was issued, so a proactive refresh can be scheduled relative to its own lifetime. */
  issuedAt: number;
  /** Absolute expiry (issuedAt + expires_in), ms since epoch. */
  expiresAt: number;
}

/** A rejected Home Assistant OAuth request; `code` is the OAuth2 `error` field (e.g. "invalid_grant"), undefined for a transport failure. */
export class HaOAuthError extends Error {
  constructor(message: string, readonly code: string | undefined) {
    super(message);
    this.name = "HaOAuthError";
  }
}

/** True for a refresh token Home Assistant has permanently rejected (revoked, or the user removed the app) — sign-in must run again, never retried automatically. */
export function isInvalidGrant(error: unknown): boolean {
  return error instanceof HaOAuthError && error.code === "invalid_grant";
}

/** The `<ha-instance>/auth/authorize` URL Hearth opens in the system browser; `state` round-trips through the redirect for CSRF protection. */
export function buildHaAuthorizeUrl(instanceBaseUrl: string, state: string): string {
  const base = normalizeHomeAssistantUrl(instanceBaseUrl);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: HA_OAUTH_CLIENT_ID_URL,
    redirect_uri: HA_OAUTH_REDIRECT_URI,
    state,
  });
  return `${base}/auth/authorize?${params.toString()}`;
}

export interface HaAuthRedirect {
  code: string;
  state: string;
}

export interface HaAuthRedirectError {
  error: string;
}

/** Reads `hearth://ha-auth?code=...&state=...` (or an `error=` redirect) from the auth session's result URL; null for a URL that isn't this redirect at all, or is missing a field it needs. */
export function parseHaAuthRedirect(url: string | null | undefined): HaAuthRedirect | HaAuthRedirectError | null {
  if (!url || !url.toLowerCase().startsWith(HA_OAUTH_REDIRECT_URI.toLowerCase())) return null;
  const queryStart = url.indexOf("?");
  const params = new URLSearchParams(queryStart >= 0 ? url.slice(queryStart + 1) : "");
  const error = params.get("error");
  if (error) return { error };
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return null;
  return { code, state };
}

interface HaTokenResponseBody {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function postHaTokenRequest(instanceBaseUrl: string, body: URLSearchParams, fallbackRefreshToken?: string): Promise<HaOAuthTokens> {
  const base = normalizeHomeAssistantUrl(instanceBaseUrl);
  const issuedAt = Date.now();
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${base}/auth/token`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() },
      HA_TOKEN_REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    throw new HaOAuthError(`Could not reach Home Assistant to complete sign-in: ${error instanceof Error ? error.message : String(error)}`, undefined);
  }
  const payload: HaTokenResponseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HaOAuthError(payload.error_description ?? `Home Assistant rejected the sign-in request (${response.status})`, payload.error);
  }
  const refreshToken = payload.refresh_token ?? fallbackRefreshToken;
  if (typeof payload.access_token !== "string" || typeof refreshToken !== "string" || typeof payload.expires_in !== "number") {
    throw new HaOAuthError("Home Assistant's response was missing a token field", undefined);
  }
  return { accessToken: payload.access_token, refreshToken, issuedAt, expiresAt: issuedAt + payload.expires_in * 1000 };
}

/**
 * Exchanges an authorization code from the redirect for an access/refresh token pair. No client secret and no
 * PKCE: Home Assistant's own auth API (unlike a generic OAuth2 provider) documents neither — confirmed against
 * the fetched docs page only, not a live server (Unverified, ADR-HEARTH-190).
 */
export function exchangeHaAuthorizationCode(instanceBaseUrl: string, code: string): Promise<HaOAuthTokens> {
  return postHaTokenRequest(instanceBaseUrl, new URLSearchParams({ grant_type: "authorization_code", code, client_id: HA_OAUTH_CLIENT_ID_URL }));
}

/** Exchanges a refresh token for a fresh access token. Home Assistant may not rotate the refresh token on every call, so the prior one is kept when the response omits it. */
export function refreshHaAccessToken(instanceBaseUrl: string, refreshToken: string): Promise<HaOAuthTokens> {
  return postHaTokenRequest(instanceBaseUrl, new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: HA_OAUTH_CLIENT_ID_URL }), refreshToken);
}
