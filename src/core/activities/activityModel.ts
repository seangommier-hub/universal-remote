import { Scene } from "../types/Scene";
import { Activity, ActivityStep, CommandStep } from "../types/Activity";
import {
  ACTIVITY_MAX_STEPS,
  ACTIVITY_NAME_MAX,
  ACTIVITY_NAME_MIN,
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  WAIT_TIMEOUT_MAX_MS,
  WAIT_TIMEOUT_MIN_MS,
} from "./activityLimits";
import { normalizeSchedules, validateSchedules } from "./scheduleModel";

const UNSYNCED_VERSION = 0;
const FAILURE_POLICIES = new Set(["continue", "stop", "retry:1", "retry:2", "retry:3"]);
const TIMEOUT_POLICIES = new Set(["continue", "stop"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Restricts a number to the inclusive range; non-finite input falls back to the minimum. */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Converts a legacy Scene into an Activity whose steps are its actions as command steps, in order. */
export function sceneToActivity(scene: Scene, nowIso: string): Activity {
  const steps: CommandStep[] = scene.actions.map((action) => {
    const step: CommandStep = { kind: "command", deviceId: action.deviceId, capability: action.capability };
    if (action.args !== undefined) step.args = action.args;
    return step;
  });
  return { id: scene.id, name: scene.name, steps, version: UNSYNCED_VERSION, updatedAt: nowIso };
}

function normalizeStep(raw: unknown): ActivityStep | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "delay" && typeof raw.ms === "number") {
    return { kind: "delay", ms: clampNumber(raw.ms, DELAY_MIN_MS, DELAY_MAX_MS) };
  }
  if (raw.kind === "waitFor" && typeof raw.deviceId === "string" && typeof raw.stateKey === "string") {
    const onTimeout = typeof raw.onTimeout === "string" && TIMEOUT_POLICIES.has(raw.onTimeout) ? raw.onTimeout : undefined;
    const timeoutMs = clampNumber(Number(raw.timeoutMs), WAIT_TIMEOUT_MIN_MS, WAIT_TIMEOUT_MAX_MS);
    return { kind: "waitFor", deviceId: raw.deviceId, stateKey: raw.stateKey, equals: raw.equals, timeoutMs, ...(onTimeout ? { onTimeout } : {}) } as ActivityStep;
  }
  if (raw.kind === "command" && typeof raw.deviceId === "string" && typeof raw.capability === "string") {
    const onFail = typeof raw.onFail === "string" && FAILURE_POLICIES.has(raw.onFail) ? raw.onFail : undefined;
    const args = isRecord(raw.args) ? raw.args : undefined;
    return { kind: "command", deviceId: raw.deviceId, capability: raw.capability, ...(args ? { args } : {}), ...(onFail ? { onFail } : {}) } as ActivityStep;
  }
  return null;
}

function normalizeSteps(rawSteps: unknown[]): ActivityStep[] {
  const steps: ActivityStep[] = [];
  for (const raw of rawSteps) {
    const step = normalizeStep(raw);
    if (step) steps.push(step);
  }
  return steps.slice(0, ACTIVITY_MAX_STEPS);
}

function sceneLikeSteps(raw: Record<string, unknown>): unknown[] {
  if (Array.isArray(raw.steps)) return raw.steps;
  if (!Array.isArray(raw.actions)) return [];
  return raw.actions.map((action) => (isRecord(action) ? { kind: "command", ...action } : action));
}

/** Turns a persisted or server record (an Activity, or a legacy Scene with `actions`) into a valid Activity, or null when it has no usable id and name. */
export function normalizeActivity(raw: unknown, nowIso: string): Activity | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string" || raw.name.trim() === "") return null;
  const activity: Activity = {
    id: raw.id,
    name: raw.name.trim().slice(0, ACTIVITY_NAME_MAX),
    steps: normalizeSteps(sceneLikeSteps(raw)),
    version: typeof raw.version === "number" && raw.version >= 0 ? Math.floor(raw.version) : UNSYNCED_VERSION,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso,
  };
  const schedules = normalizeSchedules(raw.schedules);
  if (schedules) activity.schedules = schedules;
  if (typeof raw.icon === "string") activity.icon = raw.icon;
  if (typeof raw.updatedBy === "string") activity.updatedBy = raw.updatedBy;
  return activity;
}

/** Normalizes a persisted list, dropping records that cannot be salvaged. */
export function normalizeActivityList(raw: unknown, nowIso: string): Activity[] {
  if (!Array.isArray(raw)) return [];
  const list: Activity[] = [];
  for (const entry of raw) {
    const activity = normalizeActivity(entry, nowIso);
    if (activity) list.push(activity);
  }
  return list;
}

/** Returns the first problem that would make the Pi reject this activity, or null when it is valid. */
export function validateActivity(activity: Activity): string | null {
  const nameLength = activity.name.trim().length;
  if (nameLength < ACTIVITY_NAME_MIN || nameLength > ACTIVITY_NAME_MAX) return `Name must be ${ACTIVITY_NAME_MIN} to ${ACTIVITY_NAME_MAX} characters.`;
  if (activity.steps.length === 0) return "Add at least one step.";
  if (activity.steps.length > ACTIVITY_MAX_STEPS) return `An activity can have at most ${ACTIVITY_MAX_STEPS} steps.`;
  return validateSchedules(activity.schedules);
}
