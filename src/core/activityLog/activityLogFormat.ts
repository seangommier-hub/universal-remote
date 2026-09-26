import { ActivityLogEntry } from "./activityLogEntry";

// ADR-HEARTH-170: "Sean turned off Den TV · 9:40 pm". Pure, so both the list and tests use one path.

const MS_PER_DAY = 86_400_000;
const NOON_HOUR = 12;
const MINUTES_PAD = 2;
const RECENT_DAYS = 6;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FAILURE_PREFIX = "Didn't work: ";

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function clockText(date: Date): string {
  const hour = date.getHours() % NOON_HOUR || NOON_HOUR;
  const minutes = String(date.getMinutes()).padStart(MINUTES_PAD, "0");
  return `${hour}:${minutes} ${date.getHours() < NOON_HOUR ? "am" : "pm"}`;
}

/** "9:40 pm" today, "Thu 9:40 pm" within the last week, otherwise "Sep 12, 9:40 pm". */
export function describeActivityTime(atIso: string, now: Date = new Date()): string {
  const at = new Date(atIso);
  if (Number.isNaN(at.getTime())) return "";
  const daysAgo = Math.round((startOfDay(now) - startOfDay(at)) / MS_PER_DAY);
  if (daysAgo <= 0) return clockText(at);
  if (daysAgo <= RECENT_DAYS) return `${WEEKDAYS[at.getDay()]} ${clockText(at)}`;
  return `${MONTHS[at.getMonth()]} ${at.getDate()}, ${clockText(at)}`;
}

/** One list line, e.g. "Sean turned off Den TV · 9:40 pm" or "Didn't work: Sean turned off Den TV · 9:40 pm". */
export function describeActivityEntry(entry: ActivityLogEntry, now: Date = new Date()): string {
  const sentence = `${entry.who} ${entry.verb} ${entry.deviceName}`;
  const time = describeActivityTime(entry.at, now);
  const line = entry.ok ? sentence : `${FAILURE_PREFIX}${sentence}`;
  return time ? `${line} · ${time}` : line;
}
