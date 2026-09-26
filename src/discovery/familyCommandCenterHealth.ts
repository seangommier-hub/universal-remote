import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { fccFetch } from "../core/network/fccRequest";
import { logger } from "../core/logging/logger";

// A tiny reachability probe against the Pi's health route (ADR-HEARTH-172). The answer itself is not
// read: fccFetch already records whether Family Command Center was reached, which is all the offline
// banner needs. Never throws.

const LOG_SCOPE = "FccHealth";
export const HEALTH_PATH = "/api/integrations/hearth/health";
export const HEALTH_PROBE_TIMEOUT_MS = 6000;

/** Asks Family Command Center for its health once, purely so a failure is noticed; safe to call on a timer. */
export async function probeFccHealth(): Promise<void> {
  try {
    const config = await loadFamilyCommandCenterConfig();
    if (!config) return;
    await fccFetch(config, HEALTH_PATH, {}, HEALTH_PROBE_TIMEOUT_MS);
  } catch (err) {
    logger.debug(LOG_SCOPE, "health probe could not reach Family Command Center", { message: err instanceof Error ? err.message : String(err) });
  }
}
