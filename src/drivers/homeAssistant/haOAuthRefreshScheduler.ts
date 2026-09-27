import { logger } from "../../core/logging/logger";
import { withBackoffJitter } from "../shared/backoffJitter";
import { registerHaInstance } from "./haInstanceRegistry";
import { isInvalidGrant, refreshHaAccessToken } from "./haOAuthProtocol";
import { HaOAuthState, msUntilProactiveRefresh } from "./haOAuthState";
import { markHaOAuthNeedsSignIn } from "./haOAuthStateRegistry";
import { saveHaOAuthState } from "./haOAuthStateStore";

const LOG_SCOPE = "haOAuthRefreshScheduler";
export const HA_OAUTH_RETRY_BASE_DELAY_MS = 2000;
export const HA_OAUTH_RETRY_MAX_DELAY_MS = 30_000;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const retryAttempts = new Map<string, number>();

/** Starts (or replaces) the proactive-refresh timer for one instance; a no-op once its state is `needsSignIn` (nothing to schedule until a fresh sign-in). */
export function scheduleHaOAuthRefresh(baseUrl: string, state: HaOAuthState): void {
  stopHaOAuthRefresh(state.instanceId);
  if (state.needsSignIn) return;
  const delay = Math.max(0, msUntilProactiveRefresh(state));
  const timer = setTimeout(() => void runRefresh(baseUrl, state), delay);
  timers.set(state.instanceId, timer);
}

/** Cancels an instance's scheduled refresh (its device was removed, or it is about to be rescheduled with fresh tokens). */
export function stopHaOAuthRefresh(instanceId: string): void {
  const timer = timers.get(instanceId);
  if (timer) clearTimeout(timer);
  timers.delete(instanceId);
  retryAttempts.delete(instanceId);
}

async function runRefresh(baseUrl: string, state: HaOAuthState): Promise<void> {
  try {
    const tokens = await refreshHaAccessToken(baseUrl, state.refreshToken);
    retryAttempts.delete(state.instanceId);
    registerHaInstance(baseUrl, tokens.accessToken);
    const next: HaOAuthState = { instanceId: state.instanceId, refreshToken: tokens.refreshToken, issuedAt: tokens.issuedAt, expiresAt: tokens.expiresAt, needsSignIn: false };
    await saveHaOAuthState(next);
    scheduleHaOAuthRefresh(baseUrl, next);
  } catch (error) {
    if (isInvalidGrant(error)) {
      logger.warn(LOG_SCOPE, "Home Assistant rejected the refresh token; this instance needs sign-in again", { instanceId: state.instanceId });
      markHaOAuthNeedsSignIn(state.instanceId);
      await saveHaOAuthState({ ...state, needsSignIn: true });
      return;
    }
    const attempt = (retryAttempts.get(state.instanceId) ?? 0) + 1;
    retryAttempts.set(state.instanceId, attempt);
    const delay = withBackoffJitter(Math.min(HA_OAUTH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), HA_OAUTH_RETRY_MAX_DELAY_MS));
    logger.warn(LOG_SCOPE, `Home Assistant token refresh failed, retrying in ${delay / 1000}s`, { instanceId: state.instanceId, error: String(error) });
    const timer = setTimeout(() => void runRefresh(baseUrl, state), delay);
    timers.set(state.instanceId, timer);
  }
}

/** Test-only: cancels every scheduled refresh and forgets retry counts. */
export function resetHaOAuthSchedulerForTests(): void {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  retryAttempts.clear();
}
