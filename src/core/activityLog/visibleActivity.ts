import { ActivityLogEntry } from "./activityLogEntry";

// ADR-HEARTH-208: Settings rendered all ~50 recent-activity lines inline, making the screen about ten
// phone-heights long and burying Devices to share and Bump beneath it. The list now shows the newest
// few with "Show all"; nothing is dropped, it is one tap away.

export const COLLAPSED_ACTIVITY_COUNT = 8;

/** The entries to show: the newest COLLAPSED_ACTIVITY_COUNT when collapsed, every entry when expanded. */
export function visibleActivityEntries(entries: ActivityLogEntry[], expanded: boolean): ActivityLogEntry[] {
  return expanded ? entries : entries.slice(0, COLLAPSED_ACTIVITY_COUNT);
}

/** The toggle's label, or null when there is nothing hidden to show. */
export function activityToggleLabel(total: number, expanded: boolean): string | null {
  if (total <= COLLAPSED_ACTIVITY_COUNT) return null;
  return expanded ? "Show fewer" : `Show all ${total}`;
}
