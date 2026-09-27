import { ConnectionState, PlaybackState } from "../../core/types/DeviceState";
import { HomeAssistantEntity } from "./HomeAssistantClient";
import { domainOf } from "./haEntityMapping";
import { binarySensorValues, sensorValues } from "./haSensorMapping";

const HA_UNAVAILABLE = "unavailable";
const HA_UNKNOWN = "unknown";
const HA_OFF = "off";
const PERCENT = 100;
const HA_BRIGHTNESS_MAX = 255;

/** Domains whose only state is on/off (the device shows a power button). */
const POWER_DOMAINS: readonly string[] = ["switch", "light", "media_player", "remote", "input_boolean", "fan"];

/** Home Assistant's vacuum states in the words the vacuum screen already knows (SwitchBot's `workingStatus`). */
const VACUUM_STATUS: Record<string, string> = {
  cleaning: "Clearing",
  docked: "Charging",
  returning: "GotoChargeBase",
  paused: "Paused",
  idle: "StandBy",
  error: "InTrouble",
};

function playbackOf(state: string): PlaybackState {
  if (state === "playing") return "playing";
  return state === "paused" ? "paused" : "stopped";
}

function numberAttr(entity: HomeAssistantEntity, name: string): number | undefined {
  const value = entity.attributes[name];
  return typeof value === "number" ? value : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mediaValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const { attributes } = entity;
  const values: Record<string, unknown> = { playbackState: playbackOf(entity.state) };
  if (typeof attributes.volume_level === "number") values.volume = Math.round(attributes.volume_level * PERCENT);
  if (typeof attributes.is_volume_muted === "boolean") values.muted = attributes.is_volume_muted;
  if (typeof attributes.source === "string") values.input = attributes.source;
  if (Array.isArray(attributes.source_list)) values.inputs = (attributes.source_list as string[]).map((source) => ({ id: source, label: source }));
  return values;
}

function lightValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const { brightness, hs_color: hs } = entity.attributes;
  const values: Record<string, unknown> = {};
  if (typeof brightness === "number") values.brightness = Math.round((brightness / HA_BRIGHTNESS_MAX) * PERCENT);
  if (Array.isArray(hs) && typeof hs[0] === "number" && typeof hs[1] === "number") {
    values.hue = hs[0];
    values.saturation = hs[1];
  }
  return values;
}

function coverValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const position = numberAttr(entity, "current_cover_position");
  return { coverState: entity.state, ...(position === undefined ? {} : { position }) };
}

function climateValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const numbers = { temperature: "temperature", currentTemperature: "current_temperature", minTemp: "min_temp", maxTemp: "max_temp", step: "target_temp_step" };
  const values: Record<string, unknown> = { hvacMode: entity.state, hvacModes: stringList(entity.attributes.hvac_modes) };
  for (const [key, attribute] of Object.entries(numbers)) {
    const value = numberAttr(entity, attribute);
    if (value !== undefined) values[key] = value;
  }
  if (typeof entity.attributes.hvac_action === "string") values.hvacAction = entity.attributes.hvac_action;
  return values;
}

function fanValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const percentage = numberAttr(entity, "percentage");
  const preset = entity.attributes.preset_mode;
  return {
    ...(percentage === undefined ? {} : { percentage }),
    ...(typeof preset === "string" ? { preset } : {}),
    presets: stringList(entity.attributes.preset_modes),
  };
}

const DEFAULT_CODE_ARM_REQUIRED = true;

/** An alarm panel's live state plus the two attributes that decide whether/what kind of code pad the entity screen shows (ADR-HEARTH-182): `code_arm_required` defaults true per Home Assistant's own entity docs, and no `code_format` at all means never ask for a code. */
function alarmValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const codeFormat = entity.attributes.code_format;
  return {
    alarmState: entity.state,
    codeArmRequired: entity.attributes.code_arm_required !== false ? DEFAULT_CODE_ARM_REQUIRED : false,
    ...(typeof codeFormat === "string" && codeFormat ? { codeFormat } : {}),
  };
}

function vacuumValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const battery = numberAttr(entity, "battery_level");
  return {
    vacuumState: entity.state,
    fanSpeeds: stringList(entity.attributes.fan_speed_list),
    ...(VACUUM_STATUS[entity.state] ? { workingStatus: VACUUM_STATUS[entity.state] } : {}),
    ...(battery === undefined ? {} : { battery }),
  };
}

function domainValues(entity: HomeAssistantEntity, domain: string): Record<string, unknown> {
  switch (domain) {
    case "media_player": return mediaValues(entity);
    case "light": return entity.state === HA_OFF ? {} : lightValues(entity);
    case "cover": return coverValues(entity);
    case "lock": return { lockState: entity.state };
    case "climate": return climateValues(entity);
    case "fan": return fanValues(entity);
    case "vacuum": return vacuumValues(entity);
    case "alarm_control_panel": return alarmValues(entity);
    case "sensor": return sensorValues(entity);
    case "binary_sensor": return binarySensorValues(entity);
    default: return {};
  }
}

/** True when Home Assistant says the entity cannot be reached or has no value yet ("unavailable" or "unknown"). */
export function isEntityUnavailable(entity: HomeAssistantEntity): boolean {
  return entity.state === HA_UNAVAILABLE || entity.state === HA_UNKNOWN;
}

/** The Hearth connection state for an entity: "unavailable" is disconnected and "unknown" is unknown, never quietly "off". */
export function entityConnection(entity: HomeAssistantEntity): ConnectionState {
  if (entity.state === HA_UNAVAILABLE) return "disconnected";
  return entity.state === HA_UNKNOWN ? "unknown" : "connected";
}

/** Translates a Home Assistant entity into Hearth's DeviceState values (power, volume, brightness, coverState, hvacMode...). */
export function entityToValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const domain = domainOf(entity.entity_id);
  const common: Record<string, unknown> = { name: entity.attributes.friendly_name };
  if (typeof entity.attributes.device_class === "string") common.deviceClass = entity.attributes.device_class;
  if (isEntityUnavailable(entity)) return { ...common, unavailable: true, availability: entity.state };
  if (POWER_DOMAINS.includes(domain)) common.power = entity.state === HA_OFF ? "off" : "on";
  return { ...common, ...domainValues(entity, domain) };
}
