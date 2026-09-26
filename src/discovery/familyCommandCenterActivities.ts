import { fccFetch } from "../core/network/fccRequest";
import { FccNotConfiguredError, FccTokenRejectedError } from "../core/network/fccErrors";
import { Activity, ActivityRun, ActivityTrigger } from "../core/types/Activity";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// Household activities on Family Command Center (ADR-HEARTH-150). Every call goes through the shared
// LAN-then-public client. A 404 means the Pi has not been updated with these routes yet, which the
// sync layer treats as "stay local-only" rather than an error the user must fix.

const ACTIVITIES_PATH = "/api/integrations/hearth/activities";
const TRIGGERS_PATH = "/api/integrations/hearth/triggers";
const RUNS_PATH = "/api/integrations/hearth/activity-runs";
const ACTIVITIES_TIMEOUT_MS = 8000;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
export const DEFAULT_RUN_HISTORY_LIMIT = 50;

/** The Pi answered but does not have the activities routes yet. */
export class ActivitiesUnsupportedError extends Error {}

/** The Pi rejected a request for a reason other than auth, missing routes or a version conflict. */
export class ActivitiesRequestError extends Error {}

export interface ActivitiesSnapshot {
  activities: Activity[];
  triggers: ActivityTrigger[];
  updatedAt: string;
}

export type PutActivityOutcome = { kind: "saved"; activity: Activity } | { kind: "conflict"; server: Activity };

/** Everything the sync layer needs from the Pi; tests replace it with a fake. */
export interface ActivitiesClient {
  fetchSnapshot(): Promise<ActivitiesSnapshot>;
  putActivity(activity: Activity, baseVersion: number): Promise<PutActivityOutcome>;
  deleteActivity(id: string): Promise<void>;
  putTrigger(trigger: ActivityTrigger): Promise<void>;
  deleteTrigger(id: string): Promise<void>;
  postRun(run: ActivityRun): Promise<void>;
  fetchRuns(limit?: number): Promise<ActivityRun[]>;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) throw new FccNotConfiguredError("Family Command Center isn't connected — add its address and token first.");
  const response = await fccFetch(config, path, init, ACTIVITIES_TIMEOUT_MS);
  if (response.status === HTTP_UNAUTHORIZED) throw new FccTokenRejectedError("Family Command Center rejected the saved token.");
  if (response.status === HTTP_NOT_FOUND) throw new ActivitiesUnsupportedError("Family Command Center has no activities support yet.");
  return response;
}

async function requestOk(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await request(path, init);
  if (!response.ok) throw new ActivitiesRequestError(`Family Command Center returned ${response.status}.`);
  return response;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

function unwrapActivity(body: unknown): Activity {
  const record = body as { activity?: Activity };
  return record.activity ?? (body as Activity);
}

async function fetchSnapshot(): Promise<ActivitiesSnapshot> {
  const body = (await (await requestOk(ACTIVITIES_PATH)).json()) as Partial<ActivitiesSnapshot>;
  return { activities: body.activities ?? [], triggers: body.triggers ?? [], updatedAt: body.updatedAt ?? "" };
}

async function putActivity(activity: Activity, baseVersion: number): Promise<PutActivityOutcome> {
  const response = await request(`${ACTIVITIES_PATH}/${encodeURIComponent(activity.id)}`, jsonInit("PUT", { ...activity, baseVersion }));
  if (response.status === HTTP_CONFLICT) return { kind: "conflict", server: unwrapActivity(await response.json()) };
  if (!response.ok) throw new ActivitiesRequestError(`Family Command Center returned ${response.status}.`);
  return { kind: "saved", activity: unwrapActivity(await response.json()) };
}

async function deleteActivity(id: string): Promise<void> {
  await requestOk(`${ACTIVITIES_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function putTrigger(trigger: ActivityTrigger): Promise<void> {
  await requestOk(`${TRIGGERS_PATH}/${encodeURIComponent(trigger.id)}`, jsonInit("PUT", trigger));
}

async function deleteTrigger(id: string): Promise<void> {
  await requestOk(`${TRIGGERS_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function postRun(run: ActivityRun): Promise<void> {
  await requestOk(RUNS_PATH, jsonInit("POST", run));
}

async function fetchRuns(limit: number = DEFAULT_RUN_HISTORY_LIMIT): Promise<ActivityRun[]> {
  const body = (await (await requestOk(`${RUNS_PATH}?limit=${limit}`)).json()) as { runs?: ActivityRun[] };
  return body.runs ?? [];
}

/** The real client, backed by the shared Family Command Center request path. */
export const familyCommandCenterActivitiesClient: ActivitiesClient = {
  fetchSnapshot,
  putActivity,
  deleteActivity,
  putTrigger,
  deleteTrigger,
  postRun,
  fetchRuns,
};
