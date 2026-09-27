import { ActivitySchedule } from "../types/Activity";
import { MAX_SCHEDULES_PER_ACTIVITY } from "./activityLimits";
import { parseStoredTime } from "./scheduleTime";

// ADR-HEARTH-177: reading and checking an Activity's schedules.

const LAST_DAY_INDEX = 6;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const days = raw.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= LAST_DAY_INDEX);
  return [...new Set(days)].sort((a, b) => a - b);
}

/** Turns one persisted or server record into a valid schedule, or null when it cannot be salvaged. */
export function normalizeSchedule(raw: unknown): ActivitySchedule | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) return null;
  if (typeof raw.at !== "string" || parseStoredTime(raw.at) === null) return null;
  const days = normalizeDays(raw.days);
  if (days.length === 0) return null;
  return { id: raw.id, days, at: raw.at, enabled: raw.enabled !== false };
}

/** Normalizes a stored list, dropping unusable entries and duplicate ids; undefined when the input is not a list. */
export function normalizeSchedules(raw: unknown): ActivitySchedule[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const schedules: ActivitySchedule[] = [];
  for (const entry of raw) {
    const schedule = normalizeSchedule(entry);
    if (!schedule || seen.has(schedule.id)) continue;
    seen.add(schedule.id);
    schedules.push(schedule);
  }
  return schedules.slice(0, MAX_SCHEDULES_PER_ACTIVITY);
}

/** The first problem that would make the Pi reject these schedules, or null when they are fine. */
export function validateSchedules(schedules: ActivitySchedule[] | undefined): string | null {
  if (!schedules) return null;
  if (schedules.length > MAX_SCHEDULES_PER_ACTIVITY) return `An activity can have at most ${MAX_SCHEDULES_PER_ACTIVITY} schedules.`;
  for (const schedule of schedules) {
    if (parseStoredTime(schedule.at) === null) return "Every schedule needs a valid time.";
    if (schedule.days.length === 0) return "Pick at least one day for every schedule.";
  }
  return null;
}
