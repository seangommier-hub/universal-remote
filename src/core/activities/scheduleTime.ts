// ADR-HEARTH-177: clock and calendar maths for Activity schedules. Times are wall-clock "HH:MM" in the
// timezone of the process running this code (the Pi for the scheduler, the phone for previews).

const MINUTES_PER_HOUR = 60;
const HOURS_PER_HALF_DAY = 12;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const MINUTES_PAD = 2;
const TIME_24H = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_12H = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i;
const TIME_24H_LOOSE = /^(\d{1,2}):(\d{2})$/;
const SEARCH_DAYS = DAYS_PER_WEEK + 1;
export const WEEKDAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ClockTime {
  hour: number;
  minute: number;
}

/** Reads a stored "HH:MM" (24-hour) value; null when malformed. */
export function parseStoredTime(at: string): ClockTime | null {
  const match = TIME_24H.exec(at);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

/** Writes a clock time as the stored "HH:MM" form. */
export function formatStoredTime({ hour, minute }: ClockTime): string {
  return `${String(hour).padStart(MINUTES_PAD, "0")}:${String(minute).padStart(MINUTES_PAD, "0")}`;
}

function toTwentyFourHour(hour: number, meridiem: string): number {
  const isPm = meridiem.toLowerCase() === "p";
  return (hour % HOURS_PER_HALF_DAY) + (isPm ? HOURS_PER_HALF_DAY : 0);
}

/** Understands what a person types: "8:30 pm", "8pm", "20:30", "9:05 AM"; returns the stored "HH:MM" or null. */
export function parseTypedTime(text: string): string | null {
  const trimmed = text.trim();
  const twelve = TIME_12H.exec(trimmed);
  if (twelve) {
    const hour = Number(twelve[1]);
    const minute = Number(twelve[2] ?? "0");
    if (hour < 1 || hour > HOURS_PER_HALF_DAY || minute >= MINUTES_PER_HOUR) return null;
    return formatStoredTime({ hour: toTwentyFourHour(hour, twelve[3]), minute });
  }
  const twentyFour = TIME_24H_LOOSE.exec(trimmed);
  if (!twentyFour) return null;
  const hour = Number(twentyFour[1]);
  const minute = Number(twentyFour[2]);
  return hour >= HOURS_PER_DAY || minute >= MINUTES_PER_HOUR ? null : formatStoredTime({ hour, minute });
}

/** "8:30 PM" for a stored "HH:MM"; the input itself when it cannot be read. */
export function describeStoredTime(at: string): string {
  const time = parseStoredTime(at);
  if (!time) return at;
  const displayHour = time.hour % HOURS_PER_HALF_DAY || HOURS_PER_HALF_DAY;
  return `${displayHour}:${String(time.minute).padStart(MINUTES_PAD, "0")} ${time.hour < HOURS_PER_HALF_DAY ? "AM" : "PM"}`;
}

/**
 * The instant a schedule fires on the calendar day of `day`, in local time. A time that does not exist
 * that day (spring-forward gap) lands just after the gap; a time that happens twice (fall-back) means the first.
 */
export function occurrenceOnDay(day: Date, time: ClockTime): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hour, time.minute, 0, 0);
}

/** The first instant strictly after `after` that matches `days` (0 = Sunday) at `at`; null for a malformed time or no days. */
export function nextOccurrence(days: readonly number[], at: string, after: Date): Date | null {
  const time = parseStoredTime(at);
  if (!time || days.length === 0) return null;
  for (let offset = 0; offset < SEARCH_DAYS; offset++) {
    const day = new Date(after.getFullYear(), after.getMonth(), after.getDate() + offset);
    if (!days.includes(day.getDay())) continue;
    const candidate = occurrenceOnDay(day, time);
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  return null;
}
