import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityLocalState, emptyLocalState } from "../core/activities/activityLocalState";
import { normalizeActivityList } from "../core/activities/activityModel";
import { logger } from "../core/logging/logger";

const LOG_SCOPE = "activityPersistence";
/** The pre-Activities key. Left untouched after migration so nothing is lost if a migration ever needs redoing. */
const LEGACY_SCENES_KEY = "hearth.scenes";
const ACTIVITIES_KEY = "hearth.activities.v1";
const MEMBER_NAME_KEY = "hearth.household.memberName";

function parseJson(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function readStoredState(raw: unknown, nowIso: string): ActivityLocalState {
  const stored = (raw ?? {}) as Partial<ActivityLocalState>;
  const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  return {
    activities: normalizeActivityList(stored.activities, nowIso),
    dirtyIds: strings(stored.dirtyIds),
    pendingDeleteIds: strings(stored.pendingDeleteIds),
    triggers: Array.isArray(stored.triggers) ? stored.triggers : [],
  };
}

/** Persists the whole activity state in one write. */
export async function saveActivityState(state: ActivityLocalState): Promise<void> {
  await AsyncStorage.setItem(ACTIVITIES_KEY, JSON.stringify(state));
}

async function migrateLegacyScenes(nowIso: string): Promise<ActivityLocalState> {
  const legacy = parseJson(await AsyncStorage.getItem(LEGACY_SCENES_KEY));
  const activities = normalizeActivityList(legacy, nowIso);
  if (activities.length === 0) return emptyLocalState();
  const migrated: ActivityLocalState = { ...emptyLocalState(), activities, dirtyIds: activities.map((a) => a.id) };
  await saveActivityState(migrated);
  logger.info(LOG_SCOPE, "migrated saved scenes to activities", { count: activities.length });
  return migrated;
}

/** Loads the saved activities, converting scenes saved by earlier versions the first time. */
export async function loadActivityState(nowIso: string = new Date().toISOString()): Promise<ActivityLocalState> {
  const stored = parseJson(await AsyncStorage.getItem(ACTIVITIES_KEY));
  if (stored !== undefined) return readStoredState(stored, nowIso);
  return migrateLegacyScenes(nowIso);
}

/** The name this phone's user goes by in run history, or undefined if never set. */
export async function loadMemberName(): Promise<string | undefined> {
  return (await AsyncStorage.getItem(MEMBER_NAME_KEY)) ?? undefined;
}

/** Saves the name shown as "by" in run history. */
export async function saveMemberName(name: string): Promise<void> {
  await AsyncStorage.setItem(MEMBER_NAME_KEY, name.trim());
}
