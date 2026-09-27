import { CapabilityId } from "../../core/types/Capability";
import { DeviceCategory } from "../../core/types/Device";
import { HomeAssistantEntity } from "./HomeAssistantClient";

export const HA_SYNCED_DOMAINS = [
  "switch", "light", "media_player", "remote",
  "cover", "lock", "scene", "script", "automation", "button", "input_boolean", "climate", "fan", "sensor", "binary_sensor", "vacuum",
] as const;
export type HaDomain = (typeof HA_SYNCED_DOMAINS)[number];

// Bits of media_player's `supported_features` (homeassistant/components/media_player/const.py).
const MEDIA_PAUSE = 1;
const MEDIA_VOLUME_SET = 4;
const MEDIA_VOLUME_MUTE = 8;
const MEDIA_TURN_ON = 128;
const MEDIA_TURN_OFF = 256;
const MEDIA_VOLUME_STEP = 1024;
const MEDIA_SELECT_SOURCE = 2048;

// Feature bits from Home Assistant's CoverEntityFeature, FanEntityFeature, ClimateEntityFeature and VacuumEntityFeature.
// The integration docs list the names but not the numbers, so these come from the HA source (ADR-HEARTH-178, "Unverified").
const COVER_OPEN = 1;
const COVER_CLOSE = 2;
const COVER_SET_POSITION = 4;
const COVER_STOP = 8;
const FAN_SET_SPEED = 1;
const FAN_PRESET_MODE = 8;
const CLIMATE_TARGET_TEMPERATURE = 1;
const VACUUM_STOP = 8;
const VACUUM_RETURN_HOME = 16;
const VACUUM_FAN_SPEED = 32;
const VACUUM_START = 8192;

const MIN_MODES_FOR_PICKER = 2;
const SENSOR_DEVICE_CLASS_TIMESTAMP = "timestamp";

const LIGHT_MODE_ONOFF = "onoff";
const LIGHT_COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];

/** Keys a remote entity is asked to send; the lower-case names are common but not verified against every integration (ADR-HEARTH-166). */
const REMOTE_CAPABILITIES: CapabilityId[] = ["power", "directionalNavigation", "select", "back", "home", "menu"];

const CATEGORY_BY_DOMAIN: Record<HaDomain, DeviceCategory> = {
  switch: "outlet", light: "lighting", media_player: "streaming", remote: "other",
  cover: "cover", lock: "lock", scene: "action", script: "action", automation: "action", button: "action",
  input_boolean: "outlet", climate: "climate", fan: "fan", sensor: "sensor", binary_sensor: "sensor", vacuum: "vacuum",
};

/** Stateless "run it" domains: one Run button. */
const ACTION_DOMAINS: readonly string[] = ["scene", "script", "automation", "button"];
/** Domains shown only as a reading, with no controls (so an empty capability list is right for them). */
const READ_ONLY_DOMAINS: readonly string[] = ["sensor", "binary_sensor"];

export interface ImportedHaEntity {
  entityId: string;
  domain: HaDomain;
  name: string;
  category: DeviceCategory;
  capabilities: CapabilityId[];
  /** The entity's `device_class` (garage, door, temperature...), when it has one. */
  deviceClass?: string;
}

/** The domain part of an entity id ("light.kitchen" -> "light"). */
export function domainOf(entityId: string): string {
  return entityId.split(".")[0] ?? "";
}

/** True when Hearth knows how to drive this Home Assistant domain. */
export function isSyncedDomain(domain: string): domain is HaDomain {
  return (HA_SYNCED_DOMAINS as readonly string[]).includes(domain);
}

function featureBits(entity: HomeAssistantEntity): number {
  const raw = entity.attributes.supported_features;
  return typeof raw === "number" ? raw : 0;
}

function lightCapabilities(entity: HomeAssistantEntity): CapabilityId[] {
  const modes = Array.isArray(entity.attributes.supported_color_modes) ? (entity.attributes.supported_color_modes as string[]) : [];
  const capabilities: CapabilityId[] = ["power"];
  if (modes.some((mode) => mode !== LIGHT_MODE_ONOFF)) capabilities.push("setBrightness");
  if (modes.some((mode) => LIGHT_COLOR_MODES.includes(mode))) capabilities.push("setColor");
  return capabilities;
}

function mediaPlayerPower(features: number): CapabilityId[] {
  const canTurnOn = (features & MEDIA_TURN_ON) !== 0;
  const canTurnOff = (features & MEDIA_TURN_OFF) !== 0;
  if (canTurnOn && canTurnOff) return ["power"];
  if (canTurnOn) return ["powerOn"];
  return canTurnOff ? ["powerOff"] : [];
}

function mediaPlayerCapabilities(entity: HomeAssistantEntity): CapabilityId[] {
  const features = featureBits(entity);
  const capabilities = mediaPlayerPower(features);
  if (features & MEDIA_VOLUME_SET) capabilities.push("setVolume");
  if (features & MEDIA_VOLUME_STEP) capabilities.push("volumeUp", "volumeDown");
  if (features & MEDIA_VOLUME_MUTE) capabilities.push("mute");
  if (features & MEDIA_PAUSE) capabilities.push("playPause");
  if (features & MEDIA_SELECT_SOURCE) capabilities.push("inputSelection");
  return capabilities;
}

function coverCapabilities(features: number): CapabilityId[] {
  const capabilities: CapabilityId[] = [];
  if (features & COVER_OPEN) capabilities.push("open");
  if (features & COVER_CLOSE) capabilities.push("close");
  if (features & COVER_STOP) capabilities.push("stop");
  if (features & COVER_SET_POSITION) capabilities.push("setPosition");
  return capabilities;
}

function climateCapabilities(entity: HomeAssistantEntity): CapabilityId[] {
  const capabilities: CapabilityId[] = [];
  if (featureBits(entity) & CLIMATE_TARGET_TEMPERATURE) capabilities.push("setTemperature");
  const modes = entity.attributes.hvac_modes;
  if (Array.isArray(modes) && modes.length >= MIN_MODES_FOR_PICKER) capabilities.push("setHvacMode");
  return capabilities;
}

function fanCapabilities(entity: HomeAssistantEntity): CapabilityId[] {
  const features = featureBits(entity);
  const capabilities: CapabilityId[] = ["power"];
  if (features & FAN_SET_SPEED) capabilities.push("setFanSpeed");
  const presets = entity.attributes.preset_modes;
  if (features & FAN_PRESET_MODE && Array.isArray(presets) && presets.length > 0) capabilities.push("setFanPreset");
  return capabilities;
}

function vacuumCapabilities(features: number): CapabilityId[] {
  const capabilities: CapabilityId[] = [];
  if (features & VACUUM_START) capabilities.push("vacuumStart");
  if (features & VACUUM_STOP) capabilities.push("vacuumStop");
  if (features & VACUUM_RETURN_HOME) capabilities.push("vacuumDock");
  if (features & VACUUM_FAN_SPEED) capabilities.push("setSuctionPower");
  return capabilities;
}

/** The capabilities an entity truly supports, from its domain and `supported_features` / `supported_color_modes`. */
export function capabilitiesForEntity(entity: HomeAssistantEntity): CapabilityId[] {
  const domain = domainOf(entity.entity_id);
  if (domain === "switch" || domain === "input_boolean") return ["power"];
  if (domain === "light") return lightCapabilities(entity);
  if (domain === "media_player") return mediaPlayerCapabilities(entity);
  if (domain === "remote") return REMOTE_CAPABILITIES;
  if (domain === "cover") return coverCapabilities(featureBits(entity));
  if (domain === "lock") return ["lock", "unlock"];
  if (ACTION_DOMAINS.includes(domain)) return ["trigger"];
  if (domain === "climate") return climateCapabilities(entity);
  if (domain === "fan") return fanCapabilities(entity);
  if (domain === "vacuum") return vacuumCapabilities(featureBits(entity));
  return [];
}

/** A sensor worth a tile: it has a device class or a unit (bare text sensors and timestamps are noise). */
function isUsefulSensor(entity: HomeAssistantEntity): boolean {
  const { device_class: deviceClass, unit_of_measurement: unit } = entity.attributes;
  if (deviceClass === SENSOR_DEVICE_CLASS_TIMESTAMP) return false;
  return typeof deviceClass === "string" || typeof unit === "string";
}

function isOffered(entity: HomeAssistantEntity, domain: HaDomain, capabilities: CapabilityId[]): boolean {
  if (domain === "sensor") return isUsefulSensor(entity);
  if (READ_ONLY_DOMAINS.includes(domain)) return true;
  return capabilities.length > 0;
}

/** Picks the entities Hearth can drive out of GET /api/states, each with its honest capability list. */
export function importSupportedEntities(entities: HomeAssistantEntity[]): ImportedHaEntity[] {
  const imported: ImportedHaEntity[] = [];
  for (const entity of entities) {
    const domain = domainOf(entity.entity_id);
    if (!isSyncedDomain(domain)) continue;
    const capabilities = capabilitiesForEntity(entity);
    if (!isOffered(entity, domain, capabilities)) continue;
    const friendly = entity.attributes.friendly_name;
    const name = typeof friendly === "string" && friendly ? friendly : entity.entity_id;
    const deviceClass = typeof entity.attributes.device_class === "string" ? entity.attributes.device_class : undefined;
    imported.push({ entityId: entity.entity_id, domain, name, category: CATEGORY_BY_DOMAIN[domain], capabilities, ...(deviceClass ? { deviceClass } : {}) });
  }
  return imported.sort((a, b) => a.name.localeCompare(b.name));
}
