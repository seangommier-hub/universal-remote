import { Device } from "../../core/types/Device";
import { HaInstance } from "./haInstance";
import { getHaInstance, registerHaInstance } from "./haInstanceRegistry";

/** What a Home Assistant device needs at run time: its server (with the shared credential) and its entity. */
export interface HaDeviceTarget {
  instance: HaInstance;
  entityId: string;
}

const missingConfigMessage = (deviceId: string) => `Device ${deviceId} is missing its Home Assistant connection — sync from Home Assistant again`;

/** True for a device saved before the shared client existed: it carries its own token (ADR-HEARTH-175). */
export function isLegacyHaConfig(config: Device["config"]): boolean {
  return typeof config?.token === "string" && typeof config?.baseUrl === "string";
}

/** Finds the shared instance for a device, accepting both the current `{instanceId, entityId}` and the old `{baseUrl, token, entityId}` shapes. */
export function resolveHaTarget(device: Device): HaDeviceTarget {
  const { instanceId, baseUrl, token, entityId } = device.config ?? {};
  if (typeof entityId !== "string") throw new Error(missingConfigMessage(device.id));
  if (typeof instanceId === "string") {
    const known = getHaInstance(instanceId);
    if (known) return { instance: known, entityId };
  }
  if (typeof baseUrl === "string" && typeof token === "string") return { instance: registerHaInstance(baseUrl, token), entityId };
  throw new Error(missingConfigMessage(device.id));
}
