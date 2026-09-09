import { CommandEngine } from "../core/engine/CommandEngine";
import { DeviceRegistry } from "../core/registry/DeviceRegistry";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { Device } from "../core/types/Device";
import { mockSamsungTvDriver } from "../drivers/tv/samsung/MockSamsungTvDriver";
import { mockLgTvDriver } from "../drivers/tv/lg/MockLgTvDriver";
import { SonyBraviaDriver } from "../drivers/tv/sony/SonyBraviaDriver";
import { SamsungTizenDriver } from "../drivers/tv/samsung/SamsungTizenDriver";
import { LgWebOsDriver } from "../drivers/tv/lg/LgWebOsDriver";
import { RokuEcpDriver } from "../drivers/streaming/roku/RokuEcpDriver";

export interface HearthRuntime {
  deviceRegistry: DeviceRegistry;
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  commandEngine: CommandEngine;
  devices: Device[];
}

/** Composition root for this development stage: wires the two mock TV drivers and two seed devices into a working runtime. Real drivers/discovery replace the seed devices as they're built — this function is where that swap happens. */
export function createHearthRuntime(): HearthRuntime {
  const deviceRegistry = new DeviceRegistry();
  const driverRegistry = new DriverRegistry();
  const stateStore = new StateStore();

  driverRegistry.register(mockSamsungTvDriver);
  driverRegistry.register(mockLgTvDriver);
  driverRegistry.register(new SonyBraviaDriver());
  driverRegistry.register(new SamsungTizenDriver());
  driverRegistry.register(new LgWebOsDriver());
  driverRegistry.register(new RokuEcpDriver());

  const devices: Device[] = [
    {
      id: "living-room-samsung-tv",
      name: "Living Room TV",
      category: "tv",
      manufacturer: "Samsung",
      model: "Q80 (simulated)",
      driverId: mockSamsungTvDriver.id,
      capabilities: mockSamsungTvDriver.getCapabilities(),
    },
    {
      id: "bedroom-lg-tv",
      name: "Bedroom TV",
      category: "tv",
      manufacturer: "LG",
      model: "C3 webOS (simulated)",
      driverId: mockLgTvDriver.id,
      capabilities: mockLgTvDriver.getCapabilities(),
    },
  ];

  devices.forEach((device) => deviceRegistry.add(device));

  const commandEngine = new CommandEngine(deviceRegistry, driverRegistry, stateStore);

  return { deviceRegistry, driverRegistry, stateStore, commandEngine, devices };
}

/** Connects every seed device's driver so state exists before the UI first renders. */
export async function connectAllDevices(runtime: HearthRuntime): Promise<void> {
  await Promise.all(
    runtime.devices.map((device) => {
      const driver = runtime.driverRegistry.get(device.driverId);
      return driver?.connect(device);
    })
  );
}
