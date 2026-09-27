import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { logger } from "../../core/logging/logger";
import { HaInstance } from "./haInstance";
import { registerHaInstance } from "./haInstanceRegistry";

const LOG_SCOPE = "haInstanceStore";
const INSTANCES_KEY = "hearth.haInstances.v1";

interface StoredInstance {
  id: string;
  baseUrl: string;
}

function tokenKey(instanceId: string): string {
  return `hearth.ha.instance.${instanceId.replace(/[^a-zA-Z0-9._-]/g, "-")}.token`;
}

async function readStoredList(): Promise<StoredInstance[]> {
  const raw = await AsyncStorage.getItem(INSTANCES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredInstance => typeof item?.id === "string" && typeof item?.baseUrl === "string");
  } catch {
    return [];
  }
}

/** Saves the server address in ordinary storage and its token in secure storage, and makes it known to this session. */
export async function saveHaInstance(baseUrl: string, token: string): Promise<HaInstance> {
  const instance = registerHaInstance(baseUrl, token);
  await SecureStore.setItemAsync(tokenKey(instance.id), instance.token);
  const others = (await readStoredList()).filter((stored) => stored.id !== instance.id);
  await AsyncStorage.setItem(INSTANCES_KEY, JSON.stringify([...others, { id: instance.id, baseUrl: instance.baseUrl }]));
  return instance;
}

/** Loads every saved instance (token rehydrated from secure storage) into this session; a failure is logged and leaves the rest usable. */
export async function hydrateHaInstances(): Promise<HaInstance[]> {
  const loaded: HaInstance[] = [];
  for (const stored of await readStoredList()) {
    try {
      const token = await SecureStore.getItemAsync(tokenKey(stored.id));
      if (token) loaded.push(registerHaInstance(stored.baseUrl, token));
    } catch (error) {
      logger.warn(LOG_SCOPE, "could not read a saved Home Assistant credential", { instanceId: stored.id, error: String(error) });
    }
  }
  return loaded;
}
