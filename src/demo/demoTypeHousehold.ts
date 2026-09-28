import { Platform } from "react-native";
import { Device } from "../core/types/Device";
import { cameraViewToDevice } from "../drivers/camera/ring/fccCameraApi";
import { ALEXA_PLUG_DRIVER_ID } from "../drivers/outlet/alexa/AlexaPlugDriver";
import { APPLE_TV_DRIVER_ID } from "../drivers/tv/appletv/AppleTvDriver";
import { HUE_LIGHT_DRIVER_ID } from "../drivers/lighting/hue/HueLightDriver";
import { PS5_DRIVER_ID } from "../drivers/gaming/ps5/Ps5Driver";
import { SONOS_DRIVER_ID } from "../drivers/audio/sonos/SonosDriver";
import { SQUIRREL_FEEDER_DRIVER_ID } from "../drivers/feeder/squirrelFeeder/SquirrelFeederDriver";
import { SWITCHBOT_VACUUM_DRIVER_ID } from "../drivers/vacuum/switchbot/SwitchBotVacuumDriver";
import { demoEntityDevices } from "./demoEntityDevices";
import { demoFccCameraViews } from "./demoFccCameras";
import type { DemoDeviceScript } from "./demoHousehold";
import { isDemoMode } from "./demoMode";

// ADR-HEARTH-193: a household with something in every Devices-list section, for verifying the
// group-by-type layout in the web harness (?demo=1&screen=list&household=types). It joins the
// fixed six-device household only for that URL, so every other scenario's screenshot is unchanged.

const HOUSEHOLD_QUERY_PARAM = "household";
const TYPES_HOUSEHOLD = "types";
const RING_CAMERAS_SHOWN = 2;

function extra(id: string, name: string, driverId: string, category: Device["category"], manufacturer: string, ipTail: number): Device {
  return { id, name, category, manufacturer, driverId, capabilities: [], shared: true, config: { ipAddress: `192.168.1.${ipTail}` } };
}

/** Devices added on top of the six-device household so every list section has something in it. */
function typeHouseholdExtras(): Device[] {
  return [
    extra("demo-appletv", "Den Apple TV", APPLE_TV_DRIVER_ID, "streaming", "Apple", 50),
    extra("demo-office-sonos", "Office Speaker", SONOS_DRIVER_ID, "audio", "Sonos", 51),
    extra("demo-hue-lamp", "Living Room Lamp", HUE_LIGHT_DRIVER_ID, "lighting", "Philips", 52),
    extra("demo-hue-strip", "Bedroom Light Strip", HUE_LIGHT_DRIVER_ID, "lighting", "Philips", 53),
    extra("demo-alexa-heater", "Garage Heater Plug", ALEXA_PLUG_DRIVER_ID, "outlet", "Amazon", 54),
    extra("demo-ps5", "Family Room PS5", PS5_DRIVER_ID, "gaming", "Sony", 55),
    extra("demo-vacuum", "Downstairs Vacuum", SWITCHBOT_VACUUM_DRIVER_ID, "vacuum", "SwitchBot", 56),
    extra("demo-feeder", "Squirrel Feeder", SQUIRREL_FEEDER_DRIVER_ID, "feeder", "DIY (ESP32)", 57),
  ];
}

const REACHABLE_ON: DemoDeviceScript = { reachable: true, values: { power: "on" } };

/** Starting state of the extra devices, merged into DEMO_DEVICE_SCRIPTS. */
export const DEMO_TYPE_HOUSEHOLD_SCRIPTS: Record<string, DemoDeviceScript> = Object.fromEntries(typeHouseholdExtras().map((device) => [device.id, REACHABLE_ON]));

/** True when the demo URL asks for the every-section household. */
export function isTypeHouseholdRequested(): boolean {
  if (!isDemoMode() || Platform.OS !== "web" || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(HOUSEHOLD_QUERY_PARAM) === TYPES_HOUSEHOLD;
}

/** The extra devices (extras, every Home Assistant entity kind, two Ring cameras) when the URL asks for them; empty otherwise. */
export function demoTypeHouseholdDevicesForUrl(): Device[] {
  if (!isTypeHouseholdRequested()) return [];
  return [...typeHouseholdExtras(), ...demoEntityDevices(), ...demoFccCameraViews().slice(0, RING_CAMERAS_SHOWN).map(cameraViewToDevice)];
}
