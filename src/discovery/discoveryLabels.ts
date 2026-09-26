import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "../core/logging/logger";
import { fccFetch } from "../core/network/fccRequest";
import { BrandId, isBrandId } from "./brandRegistry";
import { NetworkDevice } from "./discoverAll";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// ADR-HEARTH-153: what a person told us about a device on the network ("not a remote device",
// "it's a Roku"). Stored on the phone so it always works, and pushed to the Pi's labels endpoint
// so the rest of the household sees the same list; a Pi without the endpoint (404) is fine.

export const DISCOVER_LABELS_PATH = "/api/integrations/hearth/discover/labels";
export const LABELS_STORAGE_KEY = "hearth.discover.labels";
const HTTP_NOT_FOUND = 404;
const LOG_SCOPE = "discover-labels";

/** One person-made decision about a device; a missing field means "no opinion". */
export interface DeviceLabel {
  hidden?: boolean;
  brand?: BrandId;
  /** ADR-HEARTH-167: the person already sent a "please support this device" report for it. */
  supportRequested?: boolean;
}

export type DeviceLabels = Record<string, DeviceLabel>;

/** Stable key for a device across scans: its MAC when known, otherwise its address. */
export function labelKey(device: Pick<NetworkDevice, "mac" | "ip">): string {
  return device.mac ?? device.ip;
}

/** Reads stored labels tolerantly: anything malformed is dropped rather than trusted. */
export function parseLabels(raw: string | null): DeviceLabels {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const labels: DeviceLabels = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "object" || value === null) continue;
    const entry = value as Record<string, unknown>;
    const label: DeviceLabel = {};
    if (typeof entry.hidden === "boolean") label.hidden = entry.hidden;
    if (isBrandId(entry.brand)) label.brand = entry.brand;
    if (typeof entry.supportRequested === "boolean") label.supportRequested = entry.supportRequested;
    if (Object.keys(label).length > 0) labels[key] = label;
  }
  return labels;
}

/** Returns labels with this device's decision merged in (pure; the caller persists it). */
export function withLabel(labels: DeviceLabels, key: string, patch: DeviceLabel): DeviceLabels {
  return { ...labels, [key]: { ...labels[key], ...patch } };
}

/** Loads the labels saved on this phone. */
export async function loadLabels(): Promise<DeviceLabels> {
  try {
    return parseLabels(await AsyncStorage.getItem(LABELS_STORAGE_KEY));
  } catch (err) {
    logger.warn(LOG_SCOPE, "Could not read saved device labels", { error: String(err) });
    return {};
  }
}

/** Saves the labels on this phone. */
export async function saveLabels(labels: DeviceLabels): Promise<void> {
  try {
    await AsyncStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(labels));
  } catch (err) {
    logger.warn(LOG_SCOPE, "Could not save device labels", { error: String(err) });
  }
}

/** The body the Pi's labels endpoint expects for one device. */
export function buildLabelPayload(device: Pick<NetworkDevice, "id">, patch: DeviceLabel): Record<string, unknown> {
  return { id: device.id, ...(patch.brand !== undefined && { brand: patch.brand }), ...(patch.hidden !== undefined && { hidden: patch.hidden }) };
}

/** Best-effort: tells the Pi about a label so the whole household shares it; never throws, a missing endpoint is normal. */
export async function pushLabelToPi(device: Pick<NetworkDevice, "id">, patch: DeviceLabel): Promise<void> {
  if (patch.brand === undefined && patch.hidden === undefined) return; // support-request marks stay on this phone
  try {
    const config = await loadFamilyCommandCenterConfig();
    if (!config) return;
    const response = await fccFetch(config, DISCOVER_LABELS_PATH, { method: "PUT", body: JSON.stringify(buildLabelPayload(device, patch)) });
    if (!response.ok && response.status !== HTTP_NOT_FOUND) logger.warn(LOG_SCOPE, "Family Command Center rejected a device label", { status: response.status });
  } catch (err) {
    logger.warn(LOG_SCOPE, "Could not share a device label with Family Command Center", { error: String(err) });
  }
}
