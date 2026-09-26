import { ActivityLogEntry } from "../core/activityLog/activityLogEntry";
import { fccFetch } from "../core/network/fccRequest";
import { fccJsonRequest } from "../core/network/fccJsonRequest";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { FccSyncRejectedError } from "./familyCommandCenterDeviceSync";

// Household activity log on Family Command Center (ADR-HEARTH-170, adr/0199): phones POST batches of
// plain-language entries and read the recent ones back. Same LAN-then-public client as every FCC call.

export const ACTIVITY_LOG_PATH ="/api/integrations/hearth/activity-log";
const ACTIVITY_LOG_TIMEOUT_MS = 8000;
export const RECENT_ACTIVITY_LIMIT = 50;
const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNPROCESSABLE = 422;

/** "rejected" means the Pi understood the request and refused these entries for good, so retrying is pointless. */
export type ActivityLogPostResult = "sent" | "unconfigured" | "rejected";

/** Posts one batch; throws when the Pi cannot be reached or is not ready (so the caller retries later). */
export async function postActivityLogBatch(entries: ActivityLogEntry[]): Promise<ActivityLogPostResult> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) return "unconfigured";
  const response = await fccFetch(config, ACTIVITY_LOG_PATH, { method: "POST", body: JSON.stringify({ entries }) }, ACTIVITY_LOG_TIMEOUT_MS);
  if (response.ok) return "sent";
  if ([HTTP_BAD_REQUEST, HTTP_PAYLOAD_TOO_LARGE, HTTP_UNPROCESSABLE].includes(response.status)) return "rejected";
  throw new FccSyncRejectedError(`Family Command Center returned ${response.status}.`);
}

/** Reads the newest entries, newest first; throws a plain Error when the Pi is not connected or has no activity log yet. */
export async function fetchRecentActivity(limit: number = RECENT_ACTIVITY_LIMIT): Promise<ActivityLogEntry[]> {
  const body = await fccJsonRequest<{ entries?: ActivityLogEntry[] }>(`${ACTIVITY_LOG_PATH}?limit=${limit}`, undefined, ACTIVITY_LOG_TIMEOUT_MS);
  return Array.isArray(body.entries) ? body.entries : [];
}
