import { Device } from "../core/types/Device";
import { FccCamerasResponse } from "../core/types/Camera";
import { logger } from "../core/logging/logger";
import { cameraViewToDevice, FCC_CAMERA_DRIVER_ID, fetchFccCameras } from "../drivers/camera/ring/fccCameraApi";

const LOG_SCOPE = "fccCameraSync";

export interface CameraSyncPlan {
  toAdd: Device[];
  toRemove: Device[];
}

/**
 * What `syncFccCameras` should do to `localDevices` given the Pi's current camera list
 * (ADR-HEARTH-191): every reported camera not already a local device is added; every locally
 * synced camera (`driverId === FCC_CAMERA_DRIVER_ID`) the Pi no longer reports is removed —
 * including *every* synced camera when the household has the feature turned off (`enabled:false`,
 * an empty `reportedIds`), which is exactly what "no camera UI anywhere" requires. Unlike
 * `selectDevicesToImport`'s identity matching (protects a local rename against a duplicate add),
 * a camera has no separate rename path in this phase, so its name always tracks the Pi's.
 */
export function planCameraSync(response: FccCamerasResponse, localDevices: Device[]): CameraSyncPlan {
  const localCameras = localDevices.filter((device) => device.driverId === FCC_CAMERA_DRIVER_ID);
  const localCameraIds = new Set(localCameras.map((device) => device.id));
  const reportedIds = new Set(response.enabled ? response.cameras.map((view) => view.id) : []);
  return {
    toAdd: response.enabled ? response.cameras.filter((view) => !localCameraIds.has(view.id)).map(cameraViewToDevice) : [],
    toRemove: localCameras.filter((device) => !reportedIds.has(device.id)),
  };
}

/**
 * One-shot sync (ADR-HEARTH-191) — same "no timer, called once at startup and on foreground
 * return" shape as `autoDeviceSync.ts`'s `runAutoDeviceSync`, which it runs alongside in
 * `App.tsx`. Adds/removes Hearth `Device` entries for the household's Ring cameras so they appear
 * as ordinary tiles wherever the Devices tab already renders any other category, or disappear
 * entirely when `enabled:false`. Deliberately has no recurring poll of its own — the 5-second live
 * refresh this ADR calls for runs only while a camera's own entity screen is open
 * (`useFccCameraPoll.ts`). Never throws: with no Family Command Center saved, or it unreachable, it
 * just does nothing, so a household without cameras (or with the Pi temporarily offline) sees no
 * change and no error.
 */
export async function syncFccCameras(localDevices: Device[], addDevice: (device: Device) => void, removeDevice: (device: Device) => void): Promise<void> {
  try {
    const response = await fetchFccCameras();
    const { toAdd, toRemove } = planCameraSync(response, localDevices);
    toAdd.forEach(addDevice);
    toRemove.forEach(removeDevice);
  } catch (err) {
    logger.debug(LOG_SCOPE, "Skipped camera sync", { message: err instanceof Error ? err.message : String(err) });
  }
}
