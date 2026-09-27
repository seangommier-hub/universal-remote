import { KidModeSettings } from "./kidModeSettings";
import { isWithinBedtime } from "./bedtimeWindow";

// ADR-HEARTH-176: what the phone should present right now.

export type KidModeStatus = "off" | "restricted" | "bedtime";

/** "bedtime" only while kid mode is on and the phone clock is inside the window; the clock is the phone's own. */
export function kidModeStatus(settings: KidModeSettings, now: Date): KidModeStatus {
  if (!settings.enabled) return "off";
  return settings.bedtime && isWithinBedtime(settings.bedtime, now) ? "bedtime" : "restricted";
}
