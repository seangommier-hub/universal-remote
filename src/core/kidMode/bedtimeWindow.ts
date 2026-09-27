// ADR-HEARTH-176: an optional daily quiet window during which kid mode shows a Bedtime screen instead of
// remotes. Times are minutes since local midnight; a window that ends earlier than it starts crosses midnight.

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const HOURS_ON_CLOCK_FACE = 12;
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})$/;

export interface BedtimeWindow {
  /** Minutes since local midnight when bedtime starts. */
  startMinutes: number;
  /** Minutes since local midnight when bedtime ends. */
  endMinutes: number;
}

export const DEFAULT_BEDTIME: BedtimeWindow = { startMinutes: 20 * MINUTES_PER_HOUR + 30, endMinutes: 7 * MINUTES_PER_HOUR };

/** True when both ends are valid minutes-of-day and differ (an empty window would never or always apply). */
export function isValidBedtime(window: BedtimeWindow): boolean {
  const ok = (m: number) => Number.isInteger(m) && m >= 0 && m < MINUTES_PER_DAY;
  return ok(window.startMinutes) && ok(window.endMinutes) && window.startMinutes !== window.endMinutes;
}

/** Whether `now` falls inside the window, including windows that cross midnight. */
export function isWithinBedtime(window: BedtimeWindow, now: Date): boolean {
  const minute = now.getHours() * MINUTES_PER_HOUR + now.getMinutes();
  const { startMinutes: start, endMinutes: end } = window;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Parses "8:30" or "20:30" (24-hour) into minutes since midnight; null when it is not a clock time. */
export function parseClock(text: string): number | null {
  const match = CLOCK_PATTERN.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < MINUTES_PER_HOUR ? hours * MINUTES_PER_HOUR + minutes : null;
}

/** "20:30" for minutes since midnight. */
export function formatClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  return `${String(hours).padStart(2, "0")}:${String(totalMinutes % MINUTES_PER_HOUR).padStart(2, "0")}`;
}

/** "8:30 pm" for minutes since midnight, for showing to people. */
export function describeClock(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const hours12 = hours24 % HOURS_ON_CLOCK_FACE || HOURS_ON_CLOCK_FACE;
  return `${hours12}:${String(totalMinutes % MINUTES_PER_HOUR).padStart(2, "0")} ${hours24 < HOURS_ON_CLOCK_FACE ? "am" : "pm"}`;
}
