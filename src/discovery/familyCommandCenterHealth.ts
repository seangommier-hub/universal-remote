import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { fccFetch } from "../core/network/fccRequest";
import { logger } from "../core/logging/logger";

// A tiny reachability probe against the Pi's health route (ADR-HEARTH-172). fccFetch already
// records whether Family Command Center was reached (for the offline banner's debounced outage
// signal) as a side effect of every call here, regardless of which function below is used.

const LOG_SCOPE = "FccHealth";
export const HEALTH_PATH = "/api/integrations/hearth/health";
export const HEALTH_PROBE_TIMEOUT_MS = 6000;

/** Asks Family Command Center for its health once, reporting whether THIS specific attempt
 * reached it -- not the debounced outage signal background polling uses (getFccOutageMs only
 * reports a real outage once failures span a grace period), which a manual "check now" action
 * needs to not have to wait out. False for "not configured" and any failure alike; never throws. */
export async function checkFccReachableNow(): Promise<boolean> {
  try {
    const config = await loadFamilyCommandCenterConfig();
    if (!config) return false;
    const response = await fccFetch(config, HEALTH_PATH, {}, HEALTH_PROBE_TIMEOUT_MS);
    return response.ok;
  } catch (err) {
    logger.debug(LOG_SCOPE, "health probe could not reach Family Command Center", { message: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** Same probe as checkFccReachableNow, for a caller (the background timer) that only needs the
 * side effect (fccFetch's own success/failure recording), not the result -- safe to call on a timer. */
export async function probeFccHealth(): Promise<void> {
  await checkFccReachableNow();
}
