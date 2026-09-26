import { ActivityLogRecorder } from "../core/activityLog/ActivityLogRecorder";
import { logger } from "../core/logging/logger";
import { loadOutbox } from "./activityLogOutbox";
import { startActivityLogShipper } from "./activityLogShipper";
import { initPhoneName } from "./phoneName";

const LOG_SCOPE = "startActivityLog";

/** Loads this phone's name and any undelivered entries, then starts delivery; returns a stop function. */
export function startActivityLog(recorder: ActivityLogRecorder): () => void {
  initPhoneName().catch((err) => logger.warn(LOG_SCOPE, "could not load the phone name", { message: String(err) }));
  loadOutbox().then((saved) => recorder.restore(saved));
  return startActivityLogShipper(recorder);
}
