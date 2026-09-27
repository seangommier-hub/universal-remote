import { fetchWithTimeout } from "../core/network/fetchWithTimeout";
import { logger } from "../core/logging/logger";
import { Activity } from "../core/types/Activity";
import type { ActivityRunResult } from "./activityRunner";

// ADR-HEARTH-183: the outgoing half of the Home Assistant webhook bridge. Whenever an Activity with
// homeAssistant.outgoingWebhookUrl finishes a run (on the phone or the Pi's headless runner -- this
// is called from the shared runActivity, so both paths get it for free), a small JSON event is POSTed
// to that URL. Best-effort and fully non-blocking: called with `void`, never awaited by the caller,
// and never throws. The URL itself is never logged (Home Assistant embeds its own per-webhook secret
// in the path) -- only its hostname, on failure.

const LOG_SCOPE = "haOutgoingWebhook";
const WEBHOOK_TIMEOUT_MS = 5000;
const EVENT_NAME = "hearth_activity_run";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown-host";
  }
}

/** Posts one run's outcome to the Activity's configured outgoing webhook URL, if it has one; otherwise does nothing. */
export async function notifyHomeAssistant(activity: Activity, result: ActivityRunResult): Promise<void> {
  const url = activity.homeAssistant?.outgoingWebhookUrl;
  if (!url) return;
  const ok = !result.cancelled && result.steps.every((step) => step.status !== "failed");
  const body = {
    event: EVENT_NAME,
    activity_id: activity.id,
    activity_name: activity.name,
    run_id: result.runId,
    ok,
    at: result.finishedAt,
  };
  try {
    const response = await fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, WEBHOOK_TIMEOUT_MS);
    if (!response.ok) logger.warn(LOG_SCOPE, "Home Assistant webhook returned a non-2xx status", { host: hostOf(url), status: response.status });
  } catch (err) {
    logger.warn(LOG_SCOPE, "could not reach the Home Assistant webhook", { host: hostOf(url), message: err instanceof Error ? err.message : String(err) });
  }
}
