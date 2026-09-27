import { ActivitySchedule } from "../types/Activity";
import { MAX_SCHEDULES_PER_ACTIVITY } from "./activityLimits";
import { describeStoredTime, WEEKDAY_SHORT_NAMES } from "./scheduleTime";

// ADR-HEARTH-177: pure edit helpers and plain-language wording for the schedule editor.

const DEFAULT_SCHEDULE_TIME = "21:00";
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];
const SCHOOL_NIGHTS = [0, 1, 2, 3, 4];

/** A new enabled schedule that runs every day at 9:00 PM. */
export function newSchedule(id: string): ActivitySchedule {
  return { id, days: [...EVERY_DAY], at: DEFAULT_SCHEDULE_TIME, enabled: true };
}

/** Appends a schedule unless the activity is already at the limit. */
export function addSchedule(schedules: ActivitySchedule[], schedule: ActivitySchedule): ActivitySchedule[] {
  return schedules.length >= MAX_SCHEDULES_PER_ACTIVITY ? schedules : [...schedules, schedule];
}

/** Removes the schedule with this id. */
export function removeSchedule(schedules: ActivitySchedule[], id: string): ActivitySchedule[] {
  return schedules.filter((schedule) => schedule.id !== id);
}

/** Applies a partial change to the schedule with this id. */
export function updateSchedule(schedules: ActivitySchedule[], id: string, change: Partial<Omit<ActivitySchedule, "id">>): ActivitySchedule[] {
  return schedules.map((schedule) => (schedule.id === id ? { ...schedule, ...change } : schedule));
}

/** Adds or removes one weekday (0 = Sunday), keeping the list sorted. */
export function toggleDay(days: number[], day: number): number[] {
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
  return next.sort((a, b) => a - b);
}

function sameDays(days: number[], preset: number[]): boolean {
  return days.length === preset.length && preset.every((day) => days.includes(day));
}

/** "Every day", "Weekdays", "Weekends", "Sun to Thu", or a comma list of day names. */
export function describeDays(days: number[]): string {
  if (sameDays(days, EVERY_DAY)) return "Every day";
  if (sameDays(days, WEEKDAYS)) return "Weekdays";
  if (sameDays(days, WEEKENDS)) return "Weekends";
  if (sameDays(days, SCHOOL_NIGHTS)) return "Sun to Thu";
  return days.map((day) => WEEKDAY_SHORT_NAMES[day]).join(", ");
}

/** "Sun to Thu at 8:30 PM". */
export function describeSchedule(schedule: ActivitySchedule): string {
  return `${describeDays(schedule.days)} at ${describeStoredTime(schedule.at)}`;
}
