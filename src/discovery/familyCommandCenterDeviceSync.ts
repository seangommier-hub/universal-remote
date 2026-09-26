import { Device } from "../core/types/Device";
import { fccFetch } from "../core/network/fccRequest";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// Household-shared device list (ADR-HEARTH-129): publish this phone's devices to Family Command
// Center, or load the ones another phone published. Includes pairing credentials, so it only ever
// talks to the household's own server over its bearer-token-gated route.

const SYNC_PATH = "/api/integrations/hearth/device-sync";
const SYNC_TIMEOUT_MS = 8000;

export class FccSyncRejectedError extends Error {}

/** Uses the shared LAN-then-public client; a real HTTP rejection is never retried elsewhere. */
async function syncRequest(method: "GET" | "PUT", body?: unknown): Promise<unknown> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) throw new Error("Family Command Center isn't connected — add its address and token first.");
  const response = await fccFetch(config, SYNC_PATH, { method, body: body === undefined ? undefined : JSON.stringify(body) }, SYNC_TIMEOUT_MS);
  if (!response.ok) {
    const reason = response.status === 401 ? "Family Command Center rejected the saved token." : `Family Command Center returned ${response.status}.`;
    throw new FccSyncRejectedError(reason);
  }
  return response.json();
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
