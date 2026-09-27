import { Activity } from "../core/types/Activity";
import { Device } from "../core/types/Device";
import { ConnectionState } from "../core/types/DeviceState";
import { DEMO_ENTITY_SCRIPTS } from "./demoEntityDevices";
import { BROADLINK_IR_DRIVER_ID } from "../drivers/irHub/broadlink/BroadlinkIrDriver";
import { KASA_PLUG_DRIVER_ID } from "../drivers/outlet/kasa/KasaPlugDriver";
import { LG_WEBOS_DRIVER_ID } from "../drivers/tv/lg/LgWebOsDriver";
import { ROKU_ECP_DRIVER_ID } from "../drivers/streaming/roku/RokuEcpDriver";
import { SAMSUNG_TIZEN_DRIVER_ID } from "../drivers/tv/samsung/SamsungTizenDriver";
import { SONOS_DRIVER_ID } from "../drivers/audio/sonos/SonosDriver";

// ADR-HEARTH-157: a fixed, invented household for visual verification. Deterministic: no clocks, no randomness.

export const DEMO_LG_ID = "demo-lg";
export const DEMO_SAMSUNG_ID = "demo-samsung";
export const DEMO_ROKU_ID = "demo-roku";
export const DEMO_SONOS_ID = "demo-sonos";
export const DEMO_KASA_ID = "demo-kasa";
export const DEMO_BROADLINK_ID = "demo-broadlink";

const FIXED_TIMESTAMP = "2026-01-01T12:00:00.000Z";

/** How a demo device behaves once "connected". */
export interface DemoDeviceScript {
  reachable: boolean;
  /** Milliseconds a connect() waits before resolving; used so a device being newly paired shows the waiting card. */
  connectDelayMs?: number;
  /** The connection state a reachable device settles in; "connected" when absent (an unavailable Home Assistant entity uses "disconnected"). */
  connection?: ConnectionState;
  values: Record<string, unknown>;
}

const LG_INPUTS = [
  { id: "HDMI_1", label: "Apple TV" },
  { id: "HDMI_2", label: "PS5" },
  { id: "HDMI_3", label: "Cable Box" },
  { id: "HDMI_4", label: "Switch" },
];

// ADR-HEARTH-167: devices a person adds from the demo Discover screen with "Add all ready"; each connects after a short pause so per-row progress is visible.
const ADD_ALL_CONNECT_DELAY_MS = 600;
const ADD_ALL_DEMO_IDS = ["net-192.168.1.62", "net-192.168.1.64", "net-192.168.1.66", "net-192.168.1.67"];
const ADD_ALL_SCRIPTS: Record<string, DemoDeviceScript> = Object.fromEntries(ADD_ALL_DEMO_IDS.map((id) => [id, { reachable: true, connectDelayMs: ADD_ALL_CONNECT_DELAY_MS, values: { power: "on" } }]));

/** Per-device starting state used by the demo driver. */
export const DEMO_DEVICE_SCRIPTS: Record<string, DemoDeviceScript> = {
  [DEMO_LG_ID]: { reachable: true, values: { power: "on", volume: 18, muted: false, input: "HDMI_1", inputs: LG_INPUTS, playbackState: "playing" } },
  [DEMO_SAMSUNG_ID]: { reachable: true, values: { power: "off" } },
  [DEMO_ROKU_ID]: { reachable: false, values: {} },
  [DEMO_SONOS_ID]: { reachable: true, values: { volume: 32, muted: false, playbackState: "paused" } },
  [DEMO_KASA_ID]: { reachable: true, values: { power: "on" } },
  [DEMO_BROADLINK_ID]: { reachable: true, values: {} },
  ...ADD_ALL_SCRIPTS,
  ...DEMO_ENTITY_SCRIPTS,
};

function demoDevice(id: string, name: string, driverId: string, category: Device["category"], manufacturer: string, ipTail: number): Device {
  return { id, name, category, manufacturer, driverId, capabilities: [], shared: true, config: { ipAddress: `192.168.1.${ipTail}` } };
}

/** The six devices of the demo household: an LG TV on, a Samsung TV off, an unreachable Roku, a Sonos, a Kasa plug and a Broadlink hub. */
export function demoDevices(): Device[] {
  const broadlink = demoDevice(DEMO_BROADLINK_ID, "Family Room IR Hub", BROADLINK_IR_DRIVER_ID, "other", "Broadlink", 45);
  broadlink.capabilities = ["powerOff", "volumeUp", "volumeDown"];
  return [
    demoDevice(DEMO_LG_ID, "Living Room TV", LG_WEBOS_DRIVER_ID, "tv", "LG", 20),
    demoDevice(DEMO_SAMSUNG_ID, "Bedroom TV", SAMSUNG_TIZEN_DRIVER_ID, "tv", "Samsung", 21),
    demoDevice(DEMO_ROKU_ID, "Basement Roku", ROKU_ECP_DRIVER_ID, "streaming", "Roku", 30),
    demoDevice(DEMO_SONOS_ID, "Kitchen Sonos", SONOS_DRIVER_ID, "audio", "Sonos", 40),
    demoDevice(DEMO_KASA_ID, "Porch Light Plug", KASA_PLUG_DRIVER_ID, "outlet", "TP-Link Kasa", 41),
    broadlink,
  ];
}

function activity(id: string, name: string, icon: string, steps: Activity["steps"]): Activity {
  return { id, name, icon, steps, version: 1, updatedAt: FIXED_TIMESTAMP, updatedBy: "Demo" };
}

/** Household Activities shown on the Devices home and in the editor. */
export function demoActivities(): Activity[] {
  return [
    activity("demo-movie-night", "Movie Night", "film-outline", [
      { kind: "command", deviceId: DEMO_LG_ID, capability: "powerOn" },
      { kind: "delay", ms: 3000 },
      { kind: "command", deviceId: DEMO_LG_ID, capability: "inputSelection", args: { input: "HDMI_1" } },
      { kind: "command", deviceId: DEMO_SONOS_ID, capability: "setVolume", args: { volume: 25 } },
    ]),
    activity("demo-good-night", "Good Night", "moon-outline", [
      { kind: "command", deviceId: DEMO_LG_ID, capability: "powerOff" },
      { kind: "command", deviceId: DEMO_SAMSUNG_ID, capability: "power" },
      { kind: "command", deviceId: DEMO_KASA_ID, capability: "power" },
    ]),
    activity("demo-morning-news", "Morning News", "newspaper-outline", [
      { kind: "command", deviceId: DEMO_SAMSUNG_ID, capability: "power" },
      { kind: "waitFor", deviceId: DEMO_SAMSUNG_ID, stateKey: "power", equals: "on", timeoutMs: 8000 },
    ]),
  ];
}

