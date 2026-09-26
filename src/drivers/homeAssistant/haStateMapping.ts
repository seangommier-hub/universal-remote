import { PlaybackState } from "../../core/types/DeviceState";
import { HomeAssistantEntity } from "./HomeAssistantClient";
import { domainOf } from "./haEntityMapping";

const HA_UNAVAILABLE = "unavailable";
const HA_UNKNOWN = "unknown";
const HA_OFF = "off";
const PERCENT = 100;
const HA_BRIGHTNESS_MAX = 255;

function playbackOf(state: string): PlaybackState {
  if (state === "playing") return "playing";
  return state === "paused" ? "paused" : "stopped";
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

/** Translates a Home Assistant entity into Hearth's DeviceState values (power, volume, brightness, playbackState...). */
export function entityToValues(entity: HomeAssistantEntity): Record<string, unknown> {
  const domain = domainOf(entity.entity_id);
  const unavailable = entity.state === HA_UNAVAILABLE || entity.state === HA_UNKNOWN;
  const values: Record<string, unknown> = { power: unavailable || entity.state === HA_OFF ? "off" : "on", name: entity.attributes.friendly_name };
  if (unavailable) return { ...values, unavailable: true };
  if (domain === "media_player") Object.assign(values, mediaValues(entity));
  if (domain === "light" && entity.state !== HA_OFF) Object.assign(values, lightValues(entity));
  return values;
}
