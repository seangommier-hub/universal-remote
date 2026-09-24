import { Device } from "../core/types/Device";
import { FamilyCommandCenterConfig, loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// Household-shared device list (ADR-HEARTH-129): publish this phone's devices to Family Command
// Center, or load the ones another phone published. Includes pairing credentials, so it only ever
// talks to the household's own server over its bearer-token-gated route.

const SYNC_PATH = "/api/integrations/hearth/device-sync";
const SYNC_TIMEOUT_MS = 8000;

export class FccSyncRejectedError extends Error {}

async function requestAt(config: FamilyCommandCenterConfig, baseUrl: string, method: "GET" | "PUT", body?: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${SYNC_PATH}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const reason = response.status === 401 ? "Family Command Center rejected the saved token." : `Family Command Center returned ${response.status}.`;
      throw new FccSyncRejectedError(reason);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Tries the home address first and the public one only when the server can't be reached at all. */
async function syncRequest(method: "GET" | "PUT", body?: unknown): Promise<unknown> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) throw new Error("Family Command Center isn't connected — add its address and token first.");
  try {
    return await requestAt(config, config.baseUrl, method, body);
  } catch (err) {
    if (err instanceof FccSyncRejectedError || !config.publicBaseUrl) throw err;
    return requestAt(config, config.publicBaseUrl, method, body);
  }
}

/** Replaces the household's shared device list with this phone's devices; returns how many were shared. */
export async function publishDevices(devices: Device[]): Promise<number> {
  const result = (await syncRequest("PUT", { devices })) as { count: number };
  return result.count;
}

/** Returns the devices another phone published (empty if none have been shared yet). */
export async function fetchSharedDevices(): Promise<Device[]> {
  const result = (await syncRequest("GET")) as { devices: Device[] };
  return result.devices;
}
