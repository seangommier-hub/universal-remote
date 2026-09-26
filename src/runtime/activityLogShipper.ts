import { AppState, AppStateStatus } from "react-native";
import { ActivityLogRecorder } from "../core/activityLog/ActivityLogRecorder";
import { ActivityLogEntry } from "../core/activityLog/activityLogEntry";
import { logger } from "../core/logging/logger";
import { ActivityLogPostResult, postActivityLogBatch } from "../discovery/familyCommandCenterActivityLog";

// ADR-HEARTH-170: delivers the outbox to Family Command Center in batches, the way the client-log
// shipper does (ADR-HEARTH-146). Never awaited by a command; failures stay at debug level and the
// entries simply wait for the next attempt (the outbox is size-capped, oldest dropped first).

const LOG_SCOPE = "ActivityLogShipper";
export const SHIP_SOON_DELAY_MS = 3000;
export const RETRY_INTERVAL_MS = 60_000;
export const MAX_ENTRIES_PER_REQUEST = 100;

type PostBatch = (entries: ActivityLogEntry[]) => Promise<ActivityLogPostResult>;

export interface ActivityLogShipper {
  /** Sends one batch if any entries are waiting and none is in flight; never throws. */
  flush(): Promise<void>;
}

/** Builds a shipper that sends waiting entries oldest first and removes them once the Pi has them. */
export function createActivityLogShipper(recorder: ActivityLogRecorder, post: PostBatch = postActivityLogBatch): ActivityLogShipper {
  let inFlight = false;

  async function flush(): Promise<void> {
    if (inFlight) return;
    const batch = recorder.peek(MAX_ENTRIES_PER_REQUEST);
    if (batch.length === 0) return;
    inFlight = true;
    try {
      const result = await post(batch);
      if (result === "unconfigured") return;
      if (result === "rejected") logger.debug(LOG_SCOPE, "Pi refused a batch; dropping it", { count: batch.length });
      recorder.acknowledge(batch.map((entry) => entry.id));
    } catch (err) {
      logger.debug(LOG_SCOPE, "Could not ship activity; will retry later", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      inFlight = false;
    }
  }

  return { flush };
}

/** Ships soon after each new entry and retries every minute while the app is in the foreground; returns a stop function. */
export function startActivityLogShipper(recorder: ActivityLogRecorder, shipper: ActivityLogShipper = createActivityLogShipper(recorder)): () => void {
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  let soonTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => void shipper.flush();
  const startRetrying = () => {
    if (retryTimer) return;
    retryTimer = setInterval(flush, RETRY_INTERVAL_MS);
    flush();
  };
  const stopRetrying = () => {
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = null;
  };
  const shipSoon = () => {
    if (soonTimer) return;
    soonTimer = setTimeout(() => {
      soonTimer = null;
      flush();
    }, SHIP_SOON_DELAY_MS);
  };

  if (AppState.currentState === "active") startRetrying();
  const unsubscribe = recorder.onRecorded(shipSoon);
  const subscription = AppState.addEventListener("change", (next: AppStateStatus) => (next === "active" ? startRetrying() : stopRetrying()));
  return () => {
    stopRetrying();
    if (soonTimer) clearTimeout(soonTimer);
    unsubscribe();
    subscription.remove();
  };
}
