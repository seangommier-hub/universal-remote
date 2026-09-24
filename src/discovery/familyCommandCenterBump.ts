import { randomUUID } from "expo-crypto";
import { Device } from "../core/types/Device";
import { FamilyCommandCenterConfig, loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// "Bump to share" (ADR-HEARTH-130): submit this phone's devices; Family Command Center pairs two
// phones that bump within a few seconds of each other and hands each the other's list.

const BUMP_PATH = "/api/integrations/hearth/bump";
// Slightly longer than the server's 4s matching window so an unmatched bump resolves server-side first.
const BUMP_TIMEOUT_MS = 7000;

class BumpRejectedError extends Error {}

async function postBump(config: FamilyCommandCenterConfig, baseUrl: string, clientId: string, devices: Device[]): Promise<Device[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUMP_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${BUMP_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ clientId, devices }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new BumpRejectedError(response.status === 401 ? "Family Command Center rejected the saved token." : `Family Command Center returned ${response.status}.`);
    }
    const result = (await response.json()) as { matched: boolean; devices?: Device[] };
    return result.matched ? (result.devices ?? []) : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Sends a bump and returns the partner phone's devices, or null if no other phone bumped in time. */
export async function bumpDevices(devices: Device[]): Promise<Device[] | null> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) throw new Error("Family Command Center isn't connected — add its address and token first.");
  const clientId = randomUUID();
  try {
    return await postBump(config, config.baseUrl, clientId, devices);
  } catch (err) {
    if (err instanceof BumpRejectedError || !config.publicBaseUrl) throw err;
    return postBump(config, config.publicBaseUrl, clientId, devices);
  }
}
