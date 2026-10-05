import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "../core/logging/logger";

// ADR-HEARTH-207: the settings screen has closed the whole app on Sean's iPhone since 2026-09-28 and
// could not be reproduced on Android, in the web harness, or from the shipped client log (that log is
// in memory and ships once a minute, so a crash loses exactly the lines that would explain it). This
// writes the screen's progress to storage as it goes; a visit that never finished cleanly is reported
// at error level on the next launch, naming the last step reached, so the cause can be read off the Pi.

const BREADCRUMB_KEY = "hearth.settingsVisit.v1";
const LOG_SCOPE = "SettingsVisit";

export type SettingsVisitStage = "opened" | "motion-sensor-starting" | "motion-sensor-running";

interface SettingsVisitRecord {
  openedAt: number;
  stage: SettingsVisitStage;
  stageAt: number;
}

let openedAt = 0;

function parseRecord(raw: string | null): SettingsVisitRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SettingsVisitRecord>;
    return typeof parsed.openedAt === "number" && typeof parsed.stage === "string" ? (parsed as SettingsVisitRecord) : null;
  } catch {
    return null;
  }
}

/** Records how far the current settings visit has got; never throws. */
export async function markSettingsVisitStage(stage: SettingsVisitStage, now: number = Date.now()): Promise<void> {
  if (stage === "opened") openedAt = now;
  const record: SettingsVisitRecord = { openedAt: openedAt || now, stage, stageAt: now };
  try {
    await AsyncStorage.setItem(BREADCRUMB_KEY, JSON.stringify(record));
  } catch (error) {
    logger.debug(LOG_SCOPE, "could not record the settings visit stage", { stage, error: String(error) });
  }
}

/** Clears the record when the settings screen closes normally; never throws. */
export async function finishSettingsVisit(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BREADCRUMB_KEY);
  } catch (error) {
    logger.debug(LOG_SCOPE, "could not clear the settings visit record", { error: String(error) });
  }
}

/** On launch: logs (at error level, so it ships to the Pi) a settings visit the last run never finished, then clears it. */
export async function reportUnfinishedSettingsVisit(): Promise<SettingsVisitRecord | null> {
  try {
    const record = parseRecord(await AsyncStorage.getItem(BREADCRUMB_KEY));
    if (!record) return null;
    await AsyncStorage.removeItem(BREADCRUMB_KEY);
    logger.error(LOG_SCOPE, "The last run ended while Settings was open (a crash, or the app was swiped away there)", {
      lastStage: record.stage,
      openedAt: new Date(record.openedAt).toISOString(),
      msFromOpenToLastStage: record.stageAt - record.openedAt,
    });
    return record;
  } catch (error) {
    logger.debug(LOG_SCOPE, "could not read the settings visit record", { error: String(error) });
    return null;
  }
}
