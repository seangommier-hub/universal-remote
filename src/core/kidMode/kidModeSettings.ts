import { BedtimeWindow, isValidBedtime } from "./bedtimeWindow";

// ADR-HEARTH-176: this phone's kid-mode switch and optional bedtime window. Local to the phone, never synced.

export interface KidModeSettings {
  enabled: boolean;
  /** Absent when no bedtime lockout is set. */
  bedtime?: BedtimeWindow;
}

/** Kid mode off, no bedtime. */
export function defaultKidModeSettings(): KidModeSettings {
  return { enabled: false };
}

/** Reads saved settings back; anything missing or malformed means off with no bedtime. */
export function normalizeKidModeSettings(raw: unknown): KidModeSettings {
  if (typeof raw !== "object" || raw === null) return defaultKidModeSettings();
  const stored = raw as Record<string, unknown>;
  const window = stored.bedtime as Partial<BedtimeWindow> | undefined;
  const bedtime: BedtimeWindow | undefined =
    window && typeof window.startMinutes === "number" && typeof window.endMinutes === "number" ? { startMinutes: window.startMinutes, endMinutes: window.endMinutes } : undefined;
  return { enabled: stored.enabled === true, ...(bedtime && isValidBedtime(bedtime) ? { bedtime } : {}) };
}
