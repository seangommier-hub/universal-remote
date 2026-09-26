import { ActivityLocalState } from "../core/activities/activityLocalState";
import { normalizeActivity } from "../core/activities/activityModel";
import { classifyNetworkFailure, NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { Activity } from "../core/types/Activity";
import { logger } from "../core/logging/logger";
import { ActivitiesClient, ActivitiesSnapshot, ActivitiesUnsupportedError } from "../discovery/familyCommandCenterActivities";

const LOG_SCOPE = "activitySync";
const NEVER_SYNCED_VERSION = 0;

export interface ActivitySyncReport {
  state: ActivityLocalState;
  /** False when the Pi could not be reached; local copies were left untouched. */
  reachable: boolean;
  /** False when the Pi answered but has no activities routes yet. */
  supported: boolean;
  /** Names of activities whose local edit lost to a newer server copy (409); the server copy was kept. */
  conflicts: string[];
  diagnosis?: NetworkFailureDiagnosis;
}

interface MergeContext {
  client: ActivitiesClient;
  nowIso: string;
  dirty: Set<string>;
  conflicts: string[];
}

function sameServerVersionOrNewer(server: Activity, local: Activity | undefined): boolean {
  return local === undefined || server.version >= local.version;
}

async function flushPendingDeletes(state: ActivityLocalState, client: ActivitiesClient): Promise<string[]> {
  const stillPending: string[] = [];
  for (const id of state.pendingDeleteIds) {
    try {
      await client.deleteActivity(id);
    } catch (err) {
      if (err instanceof ActivitiesUnsupportedError) continue;
      logger.warn(LOG_SCOPE, "could not delete activity on the Pi; will retry next sync", { id, message: err instanceof Error ? err.message : String(err) });
      stillPending.push(id);
    }
  }
  return stillPending;
}

async function pushLocalEdit(local: Activity, ctx: MergeContext): Promise<Activity> {
  try {
    const outcome = await ctx.client.putActivity(local, local.version);
    if (outcome.kind === "saved") {
      ctx.dirty.delete(local.id);
      return normalizeActivity(outcome.activity, ctx.nowIso) ?? local;
    }
    ctx.dirty.delete(local.id);
    ctx.conflicts.push(local.name);
    return normalizeActivity(outcome.server, ctx.nowIso) ?? local;
  } catch (err) {
    logger.warn(LOG_SCOPE, "could not upload activity edit; keeping it local", { id: local.id, message: err instanceof Error ? err.message : String(err) });
    return local;
  }
}

async function mergeServerActivity(server: Activity, local: Activity | undefined, ctx: MergeContext): Promise<Activity> {
  if (local && ctx.dirty.has(local.id)) return pushLocalEdit(local, ctx);
  return sameServerVersionOrNewer(server, local) ? server : (local as Activity);
}

async function mergeActivities(snapshot: ActivitiesSnapshot, state: ActivityLocalState, deletedIds: Set<string>, ctx: MergeContext): Promise<Activity[]> {
  const merged: Activity[] = [];
  const serverById = new Map<string, Activity>();
  for (const raw of snapshot.activities) {
    const server = normalizeActivity(raw, ctx.nowIso);
    if (server && !deletedIds.has(server.id)) serverById.set(server.id, server);
  }
  for (const server of serverById.values()) {
    merged.push(await mergeServerActivity(server, state.activities.find((a) => a.id === server.id), ctx));
  }
  for (const local of state.activities) {
    if (serverById.has(local.id)) continue;
    const neverUploaded = local.version === NEVER_SYNCED_VERSION || ctx.dirty.has(local.id);
    if (neverUploaded) merged.push(await pushLocalEdit(local, ctx));
  }
  return merged;
}

function failureReport(state: ActivityLocalState, err: unknown): ActivitySyncReport {
  if (err instanceof ActivitiesUnsupportedError) return { state, reachable: true, supported: false, conflicts: [] };
  return { state, reachable: false, supported: true, conflicts: [], diagnosis: classifyNetworkFailure(err) };
}

/**
 * Reconciles this phone's activities with the Pi: sends pending deletes, takes newer server copies,
 * uploads local edits with baseVersion (a 409 keeps the server copy and reports the name), and
 * uploads activities the Pi has never seen. If the Pi cannot be reached or lacks the routes, the
 * local state is returned unchanged so activities keep working from this phone alone.
 */
export async function syncActivities(state: ActivityLocalState, client: ActivitiesClient, nowIso: string): Promise<ActivitySyncReport> {
  let snapshot: ActivitiesSnapshot;
  try {
    snapshot = await client.fetchSnapshot();
  } catch (err) {
    return failureReport(state, err);
  }
  const pendingDeleteIds = await flushPendingDeletes(state, client);
  const deletedIds = new Set(state.pendingDeleteIds);
  const ctx: MergeContext = { client, nowIso, dirty: new Set(state.dirtyIds), conflicts: [] };
  const activities = await mergeActivities(snapshot, state, deletedIds, ctx);
  const next: ActivityLocalState = { activities, dirtyIds: [...ctx.dirty], pendingDeleteIds, triggers: snapshot.triggers };
  return { state: next, reachable: true, supported: true, conflicts: ctx.conflicts };
}
