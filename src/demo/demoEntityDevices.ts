import { Command } from "../core/types/Command";
import { Device } from "../core/types/Device";
import { HOME_ASSISTANT_DRIVER_ID } from "../drivers/homeAssistant/HomeAssistantDriver";
import type { DemoDeviceScript } from "./demoHousehold";
import { demoScreenParam } from "./demoMode";

// ADR-HEARTH-178: invented Home Assistant devices for the web harness (?demo=1&screen=remote:ha-garage and so on).
// They join the demo household only when the URL asks for one of them, so every other scenario's screenshot is unchanged.

const ENTITY_SCREEN_PREFIX = "remote:ha-";
const DEMO_INSTANCE_ID = "ha-http-demo-8123";
const FULLY_OPEN = 100;

function entityDevice(id: string, name: string, model: string, category: Device["category"], capabilities: Device["capabilities"], deviceClass?: string): Device {
  return {
    id: `demo-${id}`, name, category, manufacturer: "Home Assistant", model, driverId: HOME_ASSISTANT_DRIVER_ID, capabilities, shared: true,
    config: { instanceId: DEMO_INSTANCE_ID, entityId: `${model}.${id.replace("ha-", "")}`, ...(deviceClass ? { deviceClass } : {}) },
  };
}

const HVAC_MODES = ["off", "heat", "cool", "heat_cool"];

/** Starting state of each demo Home Assistant device, keyed by device id. */
export const DEMO_ENTITY_SCRIPTS: Record<string, DemoDeviceScript> = {
  "demo-ha-garage": { reachable: true, values: { deviceClass: "garage", coverState: "closed", position: 0 } },
  "demo-ha-lock": { reachable: true, values: { lockState: "locked" } },
  "demo-ha-thermostat": { reachable: true, values: { hvacMode: "heat", hvacModes: HVAC_MODES, temperature: 70, currentTemperature: 68, minTemp: 45, maxTemp: 90, step: 1, hvacAction: "heating", temperatureUnit: "°F" } },
  "demo-ha-fan": { reachable: true, values: { power: "on", percentage: 60, preset: "auto", presets: ["auto", "sleep", "turbo"] } },
  "demo-ha-scene": { reachable: true, values: {} },
  "demo-ha-temp": { reachable: true, values: { deviceClass: "temperature", reading: "72.4", unit: "°F" } },
  "demo-ha-offline": { reachable: true, connection: "disconnected", values: { unavailable: true, availability: "unavailable", deviceClass: "humidity" } },
};

/** The demo Home Assistant devices: a garage door, a lock, a thermostat, a fan, a scene, a temperature sensor and an unavailable sensor. */
export function demoEntityDevices(): Device[] {
  return [
    entityDevice("ha-garage", "Garage Door", "cover", "cover", ["open", "close", "stop", "setPosition"], "garage"),
    entityDevice("ha-lock", "Front Door Lock", "lock", "lock", ["lock", "unlock"]),
    entityDevice("ha-thermostat", "Hallway Thermostat", "climate", "climate", ["setTemperature", "setHvacMode"]),
    entityDevice("ha-fan", "Bedroom Fan", "fan", "fan", ["power", "setFanSpeed", "setFanPreset"]),
    entityDevice("ha-scene", "Movie Time", "scene", "action", ["trigger"]),
    entityDevice("ha-temp", "Porch Temperature", "sensor", "sensor", [], "temperature"),
    entityDevice("ha-offline", "Attic Humidity", "sensor", "sensor", [], "humidity"),
  ];
}

/** The demo Home Assistant devices when the URL asks for one of their screens; empty in every other case. */
export function demoEntityDevicesForUrl(): Device[] {
  return demoScreenParam()?.startsWith(ENTITY_SCREEN_PREFIX) ? demoEntityDevices() : [];
}

/** What a demo press does to a Home Assistant device's state; undefined when the command is not one of the new domains'. */
export function applyEntityCommand(values: Record<string, unknown>, command: Command): Record<string, unknown> | undefined {
  const arg = (name: string): unknown => command.args?.[name];
  switch (command.capability) {
    case "open": return { ...values, coverState: "open", position: FULLY_OPEN };
    case "close": return { ...values, coverState: "closed", position: 0 };
    case "stop": return values;
    case "setPosition": return { ...values, position: arg("position"), coverState: Number(arg("position")) > 0 ? "open" : "closed" };
    case "lock": return { ...values, lockState: "locked" };
    case "unlock": return { ...values, lockState: "unlocked" };
    case "setTemperature": return { ...values, temperature: arg("temperature") };
    case "setHvacMode": return { ...values, hvacMode: arg("mode") };
    case "setFanSpeed": return { ...values, percentage: arg("percentage"), power: Number(arg("percentage")) > 0 ? "on" : "off" };
    case "setFanPreset": return { ...values, preset: arg("preset") };
    case "trigger": return values;
    default: return undefined;
  }
}
