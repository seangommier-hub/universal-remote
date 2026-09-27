import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { logger } from "../../core/logging/logger";
import { HA_OAUTH_REDIRECT_URI } from "./haOAuthConfig";
import { HaOAuthTokens, buildHaAuthorizeUrl, exchangeHaAuthorizationCode, parseHaAuthRedirect } from "./haOAuthProtocol";

const LOG_SCOPE = "haOAuthSignIn";

export type HaOAuthSignInResult =
  | { status: "success"; tokens: HaOAuthTokens }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/**
 * Opens Home Assistant's /auth/authorize page in the system browser and exchanges the resulting code for tokens
 * (ADR-HEARTH-190, Track A step 7 of ADR-HEARTH-174). Uses expo-web-browser's own redirect capture
 * (openAuthSessionAsync) rather than a global hearth:// Linking listener like usePairLinkListener.ts's pairing
 * links: Expo's own docs say the auth session already captures the redirect itself on iOS (ASWebAuthenticationSession)
 * and Android (Chrome custom tabs + its own AppState/Linking handling), and a second app-wide listener could race it.
 */
export async function signInWithHomeAssistant(instanceBaseUrl: string, generateState: () => string = () => Crypto.randomUUID()): Promise<HaOAuthSignInResult> {
  const state = generateState();
  const authorizeUrl = buildHaAuthorizeUrl(instanceBaseUrl, state);
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, HA_OAUTH_REDIRECT_URI);
  if (result.type === "cancel" || result.type === "dismiss") return { status: "cancelled" };
  if (result.type !== "success") return { status: "error", message: "Home Assistant sign-in did not complete." };

  const redirect = parseHaAuthRedirect(result.url);
  if (!redirect) return { status: "error", message: "Home Assistant's response could not be read." };
  if ("error" in redirect) return { status: "error", message: `Home Assistant declined sign-in (${redirect.error}).` };
  if (redirect.state !== state) {
    logger.warn(LOG_SCOPE, "Home Assistant sign-in redirect state did not match what Hearth sent; discarding as a possible CSRF attempt");
    return { status: "error", message: "Home Assistant's response could not be verified." };
  }

  try {
    const tokens = await exchangeHaAuthorizationCode(instanceBaseUrl, redirect.code);
    return { status: "success", tokens };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}
