import { HomeAssistantEntity } from "./HomeAssistantClient";

const BINARY_ON = "on";

/** What a binary sensor's "on" and "off" mean per device class, from the binary_sensor docs table (unlisted classes read On / Off). */
const BINARY_LABELS: Record<string, [on: string, off: string]> = {
  door: ["Open", "Closed"],
  garage_door: ["Open", "Closed"],
  window: ["Open", "Closed"],
  opening: ["Open", "Closed"],
  lock: ["Unlocked", "Locked"],
  motion: ["Motion detected", "No motion"],
  occupancy: ["Occupied", "Not occupied"],
  presence: ["Home", "Away"],
  smoke: ["Smoke detected", "No smoke"],
  moisture: ["Wet", "Dry"],
  battery: ["Low", "Normal"],
  connectivity: ["Connected", "Disconnected"],
  plug: ["Plugged in", "Unplugged"],
};
const DEFAULT_BINARY_LABELS: [string, string] = ["On", "Off"];

/** Reading for a `sensor`: its state text and unit. */
export function sensorValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const { unit_of_measurement: unit } = entity.attributes;
  return { reading: entity.state, ...(typeof unit === "string" ? { unit } : {}) };
}

/** Reading for a `binary_sensor`: whether it is active and a plain-language label for that state. */
export function binarySensorValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const deviceClass = entity.attributes.device_class;
  const [onLabel, offLabel] = (typeof deviceClass === "string" && BINARY_LABELS[deviceClass]) || DEFAULT_BINARY_LABELS;
  const active = entity.state === BINARY_ON;
  return { active, reading: active ? onLabel : offLabel };
}
