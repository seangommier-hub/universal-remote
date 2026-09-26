import { randomUUID } from "expo-crypto";
import { Device } from "../core/types/Device";
import { fccFetch } from "../core/network/fccRequest";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// "Bump to share" (ADR-HEARTH-130): submit this phone's devices; Family Command Center pairs two
// phones that bump within a few seconds of each other and hands each the other's list.

const BUMP_PATH = "/api/integrations/hearth/bump";
// Slightly longer than the server's 4s matching window so an unmatched bump resolves server-side first.
const BUMP_TIMEOUT_MS = 7000;

class BumpRejectedError extends Error {}

/** Sends a bump and returns the partner phone's devices, or null if no other phone bumped in time. */
export async function bumpDevices(devices: Device[]): Promise<Device[] | null> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) throw new Error("Family Command Center isn't connected — add its address and token first.");
  const body = JSON.stringify({ clientId: randomUUID(), devices });
  const response = await fccFetch(config, BUMP_PATH, { method: "POST", body }, BUMP_TIMEOUT_MS);
  if (!response.ok) {
    throw new BumpRejectedError(response.status === 401 ? "Family Command Center rejected the saved token." : `Family Command Center returned ${response.status}.`);
  }
  const result = (await response.json()) as { matched: boolean; devices?: Device[] };
  return result.matched ? (result.devices ?? []) : null;
}
