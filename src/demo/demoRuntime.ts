import { Device } from "../core/types/Device";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { saveFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { saveActivityState } from "../runtime/activityPersistence";
import { emptyLocalState } from "../core/activities/activityLocalState";
import { createDemoDriver } from "./demoDriver";
import { DEMO_FCC_BASE_URL, DEMO_FCC_TOKEN, installDemoFetch } from "./demoFetch";
import { demoEntityDevicesForUrl } from "./demoEntityDevices";
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

/** The demo household's devices, loaded in place of the persisted list. */
export function loadDemoDevices(): Device[] {
  return [...demoDevices(), ...demoEntityDevicesForUrl()];
}
