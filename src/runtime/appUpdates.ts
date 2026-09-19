import * as Updates from "expo-updates";
import { logger } from "../core/logging/logger";

const LOG_SCOPE = "AppUpdates";

export type UpdateCheckOutcome = "no-update" | "downloaded" | "not-supported" | "error";

/**
 * Checks for and downloads a pending EAS Update (ADR-HEARTH-084/086), if one exists. Never
 * throws — `Updates.isEnabled` is false in Expo Go and in any build that predates this ADR (no
 * `expo-updates` runtime compiled in), and a real network/server failure shouldn't be treated any
 * differently than "nothing to do right now." Callers decide what "downloaded" means for their UI
 * (an automatic banner, a manual button's result text, etc.) — this module only wraps the
 * imperative `expo-updates` API, it has no UI of its own.
 */
export async function checkAndDownloadUpdateAsync(): Promise<UpdateCheckOutcome> {
  if (!Updates.isEnabled) return "not-supported";
  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return "no-update";
    await Updates.fetchUpdateAsync();
    return "downloaded";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(LOG_SCOPE, "Could not check for or download an update", { message });
    return "error";
  }
}

/** Restarts the app to apply an already-downloaded update. Only meaningful after `checkAndDownloadUpdateAsync()` returns "downloaded" — calling it with nothing downloaded just reloads the current version. */
export async function applyDownloadedUpdateAsync(): Promise<void> {
  await Updates.reloadAsync();
}
