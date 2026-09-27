import { logger } from "../core/logging/logger";
import { Device } from "../core/types/Device";
import { HOME_ASSISTANT_DRIVER_ID } from "../drivers/homeAssistant/HomeAssistantDriver";
import { saveHaInstance } from "../drivers/homeAssistant/haInstanceStore";
import { deleteDeviceSecret, saveDevice } from "./persistence";

const LOG_SCOPE = "haDeviceMigration";
const TOKEN_FIELD = "token";

function isHaDevice(device: Device): boolean {
  return device.driverId === HOME_ASSISTANT_DRIVER_ID;
}

async function migrateOne(device: Device): Promise<Device> {
  const { baseUrl, token, entityId, instanceId } = device.config ?? {};
  if (typeof token !== "string" || typeof entityId !== "string") return device;
  let sharedInstanceId = typeof instanceId === "string" ? instanceId : null;
  if (!sharedInstanceId) {
    if (typeof baseUrl !== "string") return device;
    sharedInstanceId = (await saveHaInstance(baseUrl, token)).id;
  }
  const migrated: Device = { ...device, config: { instanceId: sharedInstanceId, entityId } };
  await saveDevice(migrated);
  await deleteDeviceSecret(device.id, TOKEN_FIELD);
  return migrated;
}

/**
 * Moves each saved Home Assistant device's own token into the shared per-server credential (ADR-HEARTH-175).
 * Order is instance first, device second, old secret last, so an interruption never loses a token and the next
 * launch simply repeats the step. A device that cannot be migrated is returned unchanged; the driver still accepts the old shape.
 */
export async function migrateHaDevices(devices: Device[]): Promise<Device[]> {
  const result: Device[] = [];
  // One at a time: saveDevice is a read-modify-write of the whole device list, so parallel saves would overwrite each other.
  for (const device of devices) {
    if (!isHaDevice(device)) {
      result.push(device);
      continue;
    }
    try {
      result.push(await migrateOne(device));
    } catch (error) {
      logger.warn(LOG_SCOPE, "could not move a Home Assistant device to the shared credential; it keeps working as before", { deviceId: device.id, error: String(error) });
      result.push(device);
    }
  }
  return result;
}
