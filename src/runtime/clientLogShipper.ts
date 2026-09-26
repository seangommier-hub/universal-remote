import { AppState, AppStateStatus } from "react-native";
import { getLogEntriesAfter } from "../core/logging/logBuffer";
import { logger } from "../core/logging/logger";
import { redactMessage, redactMeta } from "../core/logging/redact";
import { ClientLogPostResult, ClientLogWireEntry, postClientLogBatch } from "../discovery/familyCommandCenterClientLog";

// ADR-HEARTH-146. Failures are logged at debug level on purpose: a warn here would land in the
// very buffer being shipped and feed itself.

const LOG_SCOPE = "ClientLogShipper";
export const SHIP_INTERVAL_MS = 60_000;
export const MAX_ENTRIES_PER_REQUEST = 200;

export interface ClientLogShipper {
  /** Ships new entries if the throttle window has passed; never throws. */
  flush(): Promise<void>;
}

type PostBatch = (entries: ClientLogWireEntry[]) => Promise<ClientLogPostResult>;

/** Builds a shipper that sends each buffered entry at most once, at most once per interval. */
export function createClientLogShipper(post: PostBatch = postClientLogBatch, now: () => number = Date.now): ClientLogShipper {
  let cursor = 0;
  let lastAttemptAt = -Infinity;
  let inFlight = false;

  async function flush(): Promise<void> {
    if (inFlight || now() - lastAttemptAt < SHIP_INTERVAL_MS) return;
    const pending = getLogEntriesAfter(cursor);
    if (pending.length === 0) return;
    inFlight = true;
    lastAttemptAt = now();
    try {
      const batch = pending.slice(-MAX_ENTRIES_PER_REQUEST).map(
        (entry): ClientLogWireEntry => ({
          t: entry.t,
          level: entry.level,
          scope: entry.scope,
          message: redactMessage(entry.message),
          ...(entry.meta ? { meta: redactMeta(entry.meta) } : {}),
        }),
      );
      const result = await post(batch);
      if (result === "sent") cursor = pending[pending.length - 1].seq;
    } catch (err) {
      logger.debug(LOG_SCOPE, "Could not ship logs; will retry later", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      inFlight = false;
    }
  }

  return { flush };
}

/** Ships logs every minute while the app is in the foreground and once more on each return to it; returns a stop function. */
export function startClientLogShipper(shipper: ClientLogShipper = createClientLogShipper()): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const startTimer = () => {
    if (timer) return;
    timer = setInterval(() => void shipper.flush(), SHIP_INTERVAL_MS);
    void shipper.flush();
  };
  if (AppState.currentState === "active") startTimer();
  const subscription = AppState.addEventListener("change", (next: AppStateStatus) => (next === "active" ? startTimer() : stopTimer()));
  return () => {
    stopTimer();
    subscription.remove();
  };
}
