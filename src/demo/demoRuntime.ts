import { Device } from "../core/types/Device";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { saveFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { saveActivityState } from "../runtime/activityPersistence";
import { emptyLocalState } from "../core/activities/activityLocalState";
import { createDemoDriver } from "./demoDriver";
import { DEMO_FCC_BASE_URL, DEMO_FCC_TOKEN, installDemoFetch } from "./demoFetch";
import { demoEntityDevicesForUrl } from "./demoEntityDevices";
import { demoFccCameraDevicesForUrl } from "./demoFccCameras";
import { demoActivities, demoDevices } from "./demoHousehold";

/** Replaces every registered driver with its offline demo twin (same id and capabilities). */
export function swapInDemoDrivers(registry: DriverRegistry): void {
  registry.list().forEach((real) => registry.register(createDemoDriver(real)));
}

let demoStarted = false;

/** Seeds the (memory-backed) storage with a paired Family Command Center and the demo Activities and blocks real network access; idempotent. */
export async function startDemoEnvironment(): Promise<void> {
  if (demoStarted) return;
  demoStarted = true;
  installDemoFetch();
  await saveFamilyCommandCenterConfig({ baseUrl: DEMO_FCC_BASE_URL, token: DEMO_FCC_TOKEN });
  await saveActivityState({ ...emptyLocalState(), activities: demoActivities() });
}

/** The demo household's devices, loaded in place of the persisted list. A camera screen
 * (?screen=cameras or ?screen=remote:fcc-camera-*, ADR-HEARTH-191) gets ONLY the six demo Ring
 * cameras — a focused, uncluttered screenshot — instead of joining the fixed six-device household
 * the way `demoEntityDevicesForUrl`'s Home Assistant rows do. */
export function loadDemoDevices(): Device[] {
  const cameras = demoFccCameraDevicesForUrl();
  if (cameras.length > 0) return cameras;
  return [...demoDevices(), ...demoEntityDevicesForUrl()];
}
