import { ActivityLogEntry } from "../core/activityLog/activityLogEntry";

// ADR-HEARTH-170: a fixed, invented "recent activity" list for visual verification (newest first). Deterministic.

const DEMO_YEAR = 2026;

function entry(id: string, deviceName: string, verb: string, who: string, hours: number, minutes: number, error?: string): ActivityLogEntry {
  return {
    id,
    deviceId: `demo-${id}`,
    deviceName,
    verb,
    who,
    ok: error === undefined,
    ...(error === undefined ? {} : { error }),
    at: new Date(DEMO_YEAR, 0, 1, hours, minutes).toISOString(),
  };
}

/** Entries the demo Family Command Center returns from GET activity-log. */
export function demoActivityLogBody(): { entries: ActivityLogEntry[] } {
  return {
    entries: [
      entry("a1", "Den TV", "turned off", "Sean", 21, 40),
      entry("a2", "Bedroom Roku", "launched Netflix on", "Leah", 21, 5),
      entry("a3", "Kitchen Sonos", "turned the volume up on", "Leah", 20, 12),
      entry("a4", "Basement TV", "turned on", "Sean", 19, 30, "it didn't respond"),
      entry("a5", "Den TV", "typed text on", "Sean", 18, 55),
    ],
  };
}
