import { CommandEngine } from "../core/engine/CommandEngine";
import { DeviceRegistry } from "../core/registry/DeviceRegistry";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { SonyBraviaDriver } from "../drivers/tv/sony/SonyBraviaDriver";
import { SamsungTizenDriver } from "../drivers/tv/samsung/SamsungTizenDriver";
import { LgWebOsDriver } from "../drivers/tv/lg/LgWebOsDriver";
import { RokuEcpDriver } from "../drivers/streaming/roku/RokuEcpDriver";
import { HueLightDriver } from "../drivers/lighting/hue/HueLightDriver";
import { SmartThingsOutletDriver } from "../drivers/outlet/smartthings/SmartThingsOutletDriver";
import { YamahaMusicCastDriver } from "../drivers/tv/yamaha/YamahaMusicCastDriver";
import { XboxDriver } from "../drivers/gaming/xbox/XboxDriver";
import { KasaPlugDriver } from "../drivers/outlet/kasa/KasaPlugDriver";

export interface HearthRuntime {
  deviceRegistry: DeviceRegistry;
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  commandEngine: CommandEngine;
}

/**
 * Composition root: registers the real drivers. No seed/mock devices — the mocks proved
 * the driver abstraction (see src/drivers/tv/SimulatedTvDriver.ts and its tests, still exercised
 * directly by the test suite) but real-hardware testing is now the priority, so the app starts
 * with an empty device list and the user pairs real devices via "+ Add" or Discover.
 */
export function createHearthRuntime(): HearthRuntime {
  const deviceRegistry = new DeviceRegistry();
  const driverRegistry = new DriverRegistry();
  const stateStore = new StateStore();

  driverRegistry.register(new SonyBraviaDriver());
  driverRegistry.register(new SamsungTizenDriver());
  driverRegistry.register(new LgWebOsDriver());
  driverRegistry.register(new RokuEcpDriver());
  driverRegistry.register(new HueLightDriver());
  driverRegistry.register(new SmartThingsOutletDriver());
  driverRegistry.register(new YamahaMusicCastDriver());
  driverRegistry.register(new XboxDriver());
  driverRegistry.register(new KasaPlugDriver());

  const commandEngine = new CommandEngine(deviceRegistry, driverRegistry, stateStore);

  return { deviceRegistry, driverRegistry, stateStore, commandEngine };
}
