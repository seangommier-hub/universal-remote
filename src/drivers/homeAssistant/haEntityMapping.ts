import { CapabilityId } from "../../core/types/Capability";
import { DeviceCategory } from "../../core/types/Device";
import { HomeAssistantEntity } from "./HomeAssistantClient";

export const HA_SYNCED_DOMAINS = ["switch", "light", "media_player", "remote"] as const;
export type HaDomain = (typeof HA_SYNCED_DOMAINS)[number];

// Bits of media_player's `supported_features` (homeassistant/components/media_player/const.py).
const MEDIA_PAUSE = 1;
const MEDIA_VOLUME_SET = 4;
const MEDIA_VOLUME_MUTE = 8;
const MEDIA_TURN_ON = 128;
const MEDIA_TURN_OFF = 256;
const MEDIA_VOLUME_STEP = 1024;
const MEDIA_SELECT_SOURCE = 2048;

const LIGHT_MODE_ONOFF = "onoff";
const LIGHT_COLOR_MODES = ["hs", "xy", "rgb", "rgbw", "rgbww"];

/** Keys a remote entity is asked to send; the lower-case names are common but not verified against every integration (ADR-HEARTH-166). */
const REMOTE_CAPABILITIES: CapabilityId[] = ["power", "directionalNavigation", "select", "back", "home", "menu"];

const CATEGORY_BY_DOMAIN: Record<HaDomain, DeviceCategory> = { switch: "outlet", light: "lighting", media_player: "streaming", remote: "other" };

export interface ImportedHaEntity {
  entityId: string;
  domain: HaDomain;
  name: string;
  category: DeviceCategory;
  capabilities: CapabilityId[];
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

/** The capabilities an entity truly supports, from its domain and `supported_features` / `supported_color_modes`. */
export function capabilitiesForEntity(entity: HomeAssistantEntity): CapabilityId[] {
  const domain = domainOf(entity.entity_id);
  if (domain === "switch") return ["power"];
  if (domain === "light") return lightCapabilities(entity);
  if (domain === "media_player") return mediaPlayerCapabilities(entity);
  if (domain === "remote") return REMOTE_CAPABILITIES;
  return [];
}

/** Picks the entities Hearth can drive out of GET /api/states, each with its honest capability list. */
export function importSupportedEntities(entities: HomeAssistantEntity[]): ImportedHaEntity[] {
  const imported: ImportedHaEntity[] = [];
  for (const entity of entities) {
    const domain = domainOf(entity.entity_id);
    if (!isSyncedDomain(domain)) continue;
    const capabilities = capabilitiesForEntity(entity);
    if (capabilities.length === 0) continue;
    const friendly = entity.attributes.friendly_name;
    const name = typeof friendly === "string" && friendly ? friendly : entity.entity_id;
    imported.push({ entityId: entity.entity_id, domain, name, category: CATEGORY_BY_DOMAIN[domain], capabilities });
  }
  return imported.sort((a, b) => a.name.localeCompare(b.name));
}
