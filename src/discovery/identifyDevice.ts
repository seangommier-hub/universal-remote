import { logger } from "../core/logging/logger";
import { fccFetch } from "../core/network/fccRequest";
import { DeviceIdentity } from "./deviceIdentity";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// ADR-HEARTH-156: asks the Pi to interrogate one address (Roku device-info, Samsung /api/v2/,
// UPnP description, ...) and report who it is. Any failure, including an older Pi without the
// endpoint (404), is "no answer" (null), so adding a device never gets worse than before.

export const IDENTIFY_PATH = "/api/integrations/hearth/discover/identify";
export const IDENTIFY_TIMEOUT_MS = 5000;
const LOG_SCOPE = "identify-device";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Reads the endpoint's JSON tolerantly; a body with no usable field yields null. */
export function parseIdentity(body: unknown): DeviceIdentity | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  const identity: DeviceIdentity = {
    brand: text(raw.brand) ?? null,
    model: text(raw.model),
    name: text(raw.friendlyName),
    uuid: text(raw.uuid),
    mac: text(raw.mac)?.toLowerCase(),
    serial: text(raw.serial),
    evidence: Array.isArray(raw.evidence) ? raw.evidence.filter((item): item is string => typeof item === "string") : [],
  };
  const hasSignal = identity.brand || identity.model || identity.name || identity.uuid || identity.mac || identity.serial;
  return hasSignal ? identity : null;
}

/** Asks the Pi what the device at this address is; null when unknown, unconfigured, unsupported or unreachable. */
export async function identifyDeviceByIp(ip: string): Promise<DeviceIdentity | null> {
  try {
    const config = await loadFamilyCommandCenterConfig();
    if (!config) return null;
    const response = await fccFetch(config, `${IDENTIFY_PATH}?ip=${encodeURIComponent(ip)}`, {}, IDENTIFY_TIMEOUT_MS);
    if (!response.ok) return null;
    return parseIdentity(await response.json());
  } catch (error) {
    logger.warn(LOG_SCOPE, `identify failed for ${ip}`, { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
