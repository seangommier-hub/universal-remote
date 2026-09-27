import { CommandEngine } from "../core/engine/CommandEngine";
import { DeviceRegistry } from "../core/registry/DeviceRegistry";
import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { StateStore } from "../core/state/StateStore";
import { setSelfHealContext } from "../drivers/shared/selfHealContext";
import { brandForDriverId } from "../discovery/brandRegistry";
import { SonyBraviaDriver } from "../drivers/tv/sony/SonyBraviaDriver";
import { SamsungTizenDriver } from "../drivers/tv/samsung/SamsungTizenDriver";
import { LgWebOsDriver } from "../drivers/tv/lg/LgWebOsDriver";
import { RokuEcpDriver } from "../drivers/streaming/roku/RokuEcpDriver";
import { HueLightDriver } from "../drivers/lighting/hue/HueLightDriver";
import { GoveeLightDriver } from "../drivers/lighting/govee/GoveeLightDriver";
import { SmartThingsOutletDriver } from "../drivers/outlet/smartthings/SmartThingsOutletDriver";
import { AlexaPlugDriver } from "../drivers/outlet/alexa/AlexaPlugDriver";
import { YamahaMusicCastDriver } from "../drivers/tv/yamaha/YamahaMusicCastDriver";
import { XboxDriver } from "../drivers/gaming/xbox/XboxDriver";
import { KasaPlugDriver } from "../drivers/outlet/kasa/KasaPlugDriver";
import { SonosDriver } from "../drivers/audio/sonos/SonosDriver";
import { Ps5Driver } from "../drivers/gaming/ps5/Ps5Driver";
import { DenonDriver } from "../drivers/tv/denon/DenonDriver";
import { ChromecastDriver } from "../drivers/streaming/chromecast/ChromecastDriver";
import { BroadlinkIrDriver } from "../drivers/irHub/broadlink/BroadlinkIrDriver";
import { SquirrelFeederDriver } from "../drivers/feeder/squirrelFeeder/SquirrelFeederDriver";
import { AndroidTvDriver } from "../drivers/tv/androidtv/AndroidTvDriver";
import { AppleTvDriver } from "../drivers/tv/appletv/AppleTvDriver";
import { SwitchBotVacuumDriver } from "../drivers/vacuum/switchbot/SwitchBotVacuumDriver";
import { HomeAssistantDriver } from "../drivers/homeAssistant/HomeAssistantDriver";
import { LifxLightDriver } from "../drivers/lighting/lifx/LifxLightDriver";
import { ShellyRelayDriver } from "../drivers/outlet/shelly/ShellyRelayDriver";
import { VizioSmartCastDriver } from "../drivers/tv/vizio/VizioSmartCastDriver";
import { WizLightDriver } from "../drivers/lighting/wiz/WizLightDriver";
import { randomUUID } from "expo-crypto";
import { ActivityLogRecorder } from "../core/activityLog/ActivityLogRecorder";
import { saveOutbox } from "./activityLogOutbox";
import { getLoggedWho } from "./loggedWho";
import { isDemoMode } from "../demo/demoMode";
import { swapInDemoDrivers } from "../demo/demoRuntime";

export interface HearthRuntime {
  deviceRegistry: DeviceRegistry;
  driverRegistry: DriverRegistry;
  stateStore: StateStore;
  commandEngine: CommandEngine;
  /** Outbox of household activity entries (ADR-HEARTH-170); fed by the command engine, drained by the shipper. */
  activityLog: ActivityLogRecorder;
}

function createActivityLogRecorder(): ActivityLogRecorder {
  return new ActivityLogRecorder({ getWho: getLoggedWho, newId: randomUUID, now: Date.now, onChange: saveOutbox });
}

/**
 * Composition root: registers the real drivers. No seed/mock devices — the mocks proved
 * the driver abstraction (see src/drivers/tv/SimulatedTvDriver.ts and its tests, still exercised
 * directly by the test suite) but real-hardware testing is now the priority, so the app starts
 * with an empty device list and the user pairs real devices via "+ Add" or Discover.
 */
export function createHearthRuntime(): HearthRuntime {
  const deviceRegistry = new DeviceRegistry();
  setSelfHealContext({ savedDevices: () => deviceRegistry.list(), brandIdForDriver: (driverId) => brandForDriverId(driverId)?.id });
  const driverRegistry = new DriverRegistry();
  const stateStore = new StateStore();

  driverRegistry.register(new SonyBraviaDriver());
  driverRegistry.register(new SamsungTizenDriver());
  driverRegistry.register(new LgWebOsDriver());
  driverRegistry.register(new RokuEcpDriver());
  driverRegistry.register(new HueLightDriver());
  driverRegistry.register(new SmartThingsOutletDriver());
  driverRegistry.register(new AlexaPlugDriver());
  driverRegistry.register(new YamahaMusicCastDriver());
  driverRegistry.register(new XboxDriver());
  driverRegistry.register(new KasaPlugDriver());
  driverRegistry.register(new SonosDriver());
  driverRegistry.register(new Ps5Driver());
  driverRegistry.register(new DenonDriver());
  driverRegistry.register(new ChromecastDriver());
  driverRegistry.register(new BroadlinkIrDriver());
  driverRegistry.register(new SquirrelFeederDriver());
  driverRegistry.register(new AppleTvDriver());
  driverRegistry.register(new AndroidTvDriver());
  driverRegistry.register(new SwitchBotVacuumDriver());
  driverRegistry.register(new HomeAssistantDriver());
  driverRegistry.register(new VizioSmartCastDriver());
  driverRegistry.register(new WizLightDriver());
  driverRegistry.register(new LifxLightDriver());
  driverRegistry.register(new ShellyRelayDriver());
  driverRegistry.register(new GoveeLightDriver());

  if (isDemoMode()) swapInDemoDrivers(driverRegistry);

  const commandEngine = new CommandEngine(deviceRegistry, driverRegistry, stateStore);
  const activityLog = createActivityLogRecorder();
  if (!isDemoMode()) commandEngine.setOutcomeObserver((command, device, result, options) => activityLog.record(command, device, result, options.cause));

  return { deviceRegistry, driverRegistry, stateStore, commandEngine, activityLog };
}
