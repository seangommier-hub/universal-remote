import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import * as Updates from "expo-updates";
import { FccSyncRejectedError } from "./familyCommandCenterDeviceSync";
import { FamilyCommandCenterConfig, loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// Remote diagnostics (ADR-HEARTH-146): ships this phone's recent, already-redacted warn/error log
// lines to Family Command Center so problems can be read without a USB cable.

const CLIENT_LOG_PATH = "/api/integrations/hearth/client-log";
const CLIENT_LOG_TIMEOUT_MS = 8000;
const CLIENT_ID_KEY = "hearth.clientLog.clientId";
const CLIENT_ID_MAX_LENGTH = 64;
const UNKNOWN_VERSION = "dev";
const UPDATE_ID_PREFIX_LENGTH = 8;

export interface ClientLogWireEntry {
  t: number;
  level: "warn" | "error";
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

export type ClientLogPostResult = "sent" | "unconfigured";

/** Returns this install's random ID, creating and persisting it on first use. */
export async function getOrCreateClientLogId(): Promise<string> {
  const existing = await AsyncStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const created = randomUUID().slice(0, CLIENT_ID_MAX_LENGTH);
  await AsyncStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}

function describeAppVersion(): string {
  const runtime = Updates.runtimeVersion ?? UNKNOWN_VERSION;
  return Updates.updateId ? `${runtime}+${Updates.updateId.slice(0, UPDATE_ID_PREFIX_LENGTH)}` : runtime;
}

async function postAt(config: FamilyCommandCenterConfig, baseUrl: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_LOG_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${CLIENT_LOG_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new FccSyncRejectedError(`Family Command Center returned ${response.status}.`);
  } finally {
    clearTimeout(timer);
  }
}

/** Posts one batch of redacted entries; tries the home address first, then the public one only if the server can't be reached at all. Throws on failure. */
export async function postClientLogBatch(entries: ClientLogWireEntry[]): Promise<ClientLogPostResult> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) return "unconfigured";
  const body = { clientId: await getOrCreateClientLogId(), appVersion: describeAppVersion(), platform: Platform.OS, entries };
  try {
    await postAt(config, config.baseUrl, body);
  } catch (err) {
    if (err instanceof FccSyncRejectedError || !config.publicBaseUrl) throw err;
    await postAt(config, config.publicBaseUrl, body);
  }
  return "sent";
}
