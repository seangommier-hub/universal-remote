import { Command } from "../../core/types/Command";
import { domainOf } from "./haEntityMapping";

const PERCENT = 100;

export interface HaServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/** A command the caller got wrong (bad argument, unsupported capability); never evidence the server is unreachable. */
export class HaCommandValidationError extends Error {}

const REMOTE_KEYS: Record<string, string> = { select: "select", back: "back", home: "home", menu: "menu" };

function numberArg(command: Command, name: string): number {
  const value = command.args?.[name];
  if (typeof value !== "number") throw new HaCommandValidationError(`${command.capability} requires a numeric '${name}' arg`);
  return value;
}

function remoteCommand(command: Command, entityId: string): HaServiceCall {
  const key = command.capability === "directionalNavigation" ? command.args?.direction : REMOTE_KEYS[command.capability];
  if (typeof key !== "string") throw new HaCommandValidationError(`${command.capability} requires a valid 'direction' arg`);
  return { domain: "remote", service: "send_command", data: { entity_id: entityId, command: [key] } };
}

function mediaPlayerCommand(command: Command, entityId: string, values: Record<string, unknown>): HaServiceCall {
  const call = (service: string, extra: Record<string, unknown> = {}): HaServiceCall => ({ domain: "media_player", service, data: { entity_id: entityId, ...extra } });
  switch (command.capability) {
    case "setVolume":
      return call("volume_set", { volume_level: numberArg(command, "volume") / PERCENT });
    case "volumeUp":
      return call("volume_up");
    case "volumeDown":
      return call("volume_down");
    case "mute":
      return call("volume_mute", { is_volume_muted: values.muted !== true });
    case "playPause":
      return call("media_play_pause");
    case "inputSelection":
      if (typeof command.args?.input !== "string") throw new HaCommandValidationError("inputSelection requires a string 'input' arg");
      return call("select_source", { source: command.args.input });
    case "playMedia": {
      const mediaContentId = stringArg(command, "mediaContentId");
      const mediaContentType = command.args?.mediaContentType;
      return call("play_media", { media_content_id: mediaContentId, ...(typeof mediaContentType === "string" && mediaContentType ? { media_content_type: mediaContentType } : {}) });
    }
    default:
      throw new HaCommandValidationError(`Home Assistant media players do not implement ${command.capability}`);
  }
}

function lightCommand(command: Command, entityId: string): HaServiceCall {
  const turnOn = (extra: Record<string, unknown>): HaServiceCall => ({ domain: "light", service: "turn_on", data: { entity_id: entityId, ...extra } });
  if (command.capability === "setBrightness") return turnOn({ brightness_pct: numberArg(command, "brightness") });
  if (command.capability === "setColor") return turnOn({ hs_color: [numberArg(command, "hue"), numberArg(command, "saturation")] });
  throw new HaCommandValidationError(`Home Assistant lights do not implement ${command.capability}`);
}

const MAX_PERCENT = 100;
const SUCTION_MAX_LEVEL = 3;

function stringArg(command: Command, name: string): string {
  const value = command.args?.[name];
  if (typeof value !== "string" || !value) throw new HaCommandValidationError(`${command.capability} requires a string '${name}' arg`);
  return value;
}

function percentArg(command: Command, name: string): number {
  return Math.max(0, Math.min(MAX_PERCENT, Math.round(numberArg(command, name))));
}

function serviceCall(domain: string, service: string, entityId: string, extra: Record<string, unknown> = {}): HaServiceCall {
  return { domain, service, data: { entity_id: entityId, ...extra } };
}

const COVER_SERVICES: Record<string, string> = { open: "open_cover", close: "close_cover", stop: "stop_cover" };
const LOCK_SERVICES: Record<string, string> = { lock: "lock", unlock: "unlock" };
const VACUUM_SERVICES: Record<string, string> = { vacuumStart: "start", vacuumStop: "stop", vacuumDock: "return_to_base" };
const ACTION_SERVICES: Record<string, string> = { scene: "turn_on", script: "turn_on", automation: "trigger", button: "press" };
// ADR-HEARTH-182, developers.home-assistant.io/docs/core/entity/alarm-control-panel (fetched 2026-09-27).
const ALARM_SERVICES: Record<string, string> = { armHome: "alarm_arm_home", armAway: "alarm_arm_away", armNight: "alarm_arm_night", disarm: "alarm_disarm" };

function coverCommand(command: Command, entityId: string): HaServiceCall {
  const service = COVER_SERVICES[command.capability];
  if (service) return serviceCall("cover", service, entityId);
  if (command.capability === "setPosition") return serviceCall("cover", "set_cover_position", entityId, { position: percentArg(command, "position") });
  throw new HaCommandValidationError(`Home Assistant covers do not implement ${command.capability}`);
}

function climateCommand(command: Command, entityId: string): HaServiceCall {
  if (command.capability === "setTemperature") return serviceCall("climate", "set_temperature", entityId, { temperature: numberArg(command, "temperature") });
  if (command.capability === "setHvacMode") return serviceCall("climate", "set_hvac_mode", entityId, { hvac_mode: stringArg(command, "mode") });
  throw new HaCommandValidationError(`Home Assistant climate entities do not implement ${command.capability}`);
}

function fanCommand(command: Command, entityId: string): HaServiceCall {
  if (command.capability === "setFanSpeed") return serviceCall("fan", "set_percentage", entityId, { percentage: percentArg(command, "percentage") });
  if (command.capability === "setFanPreset") return serviceCall("fan", "set_preset_mode", entityId, { preset_mode: stringArg(command, "preset") });
  throw new HaCommandValidationError(`Home Assistant fans do not implement ${command.capability}`);
}

/** Robot vacuums: Hearth's four suction levels (0-3) are spread across the entity's own `fan_speed_list`. */
function vacuumCommand(command: Command, entityId: string, values: Record<string, unknown>): HaServiceCall {
  const service = VACUUM_SERVICES[command.capability];
  if (service) return serviceCall("vacuum", service, entityId);
  const speeds = Array.isArray(values.fanSpeeds) ? (values.fanSpeeds as string[]) : [];
  if (command.capability !== "setSuctionPower" || speeds.length === 0) throw new HaCommandValidationError(`This vacuum does not implement ${command.capability}`);
  const level = Math.max(0, Math.min(SUCTION_MAX_LEVEL, numberArg(command, "level")));
  return serviceCall("vacuum", "set_fan_speed", entityId, { fan_speed: speeds[Math.round((level / SUCTION_MAX_LEVEL) * (speeds.length - 1))] });
}

/** Maps a Hearth command to the Home Assistant service call that performs it for one entity. */
export function commandToServiceCall(command: Command, entityId: string, values: Record<string, unknown>): HaServiceCall {
  const domain = domainOf(entityId);
  const powerServices: Record<string, string> = { power: "toggle", powerOn: "turn_on", powerOff: "turn_off" };
  const powerService = powerServices[command.capability];
  if (powerService) return { domain, service: powerService, data: { entity_id: entityId } };
  if (domain === "media_player") return mediaPlayerCommand(command, entityId, values);
  if (domain === "light") return lightCommand(command, entityId);
  if (domain === "remote") return remoteCommand(command, entityId);
  if (domain === "cover") return coverCommand(command, entityId);
  if (domain === "lock" && LOCK_SERVICES[command.capability]) return serviceCall("lock", LOCK_SERVICES[command.capability], entityId);
  if (ACTION_SERVICES[domain] && command.capability === "trigger") return serviceCall(domain, ACTION_SERVICES[domain], entityId);
  if (domain === "climate") return climateCommand(command, entityId);
  if (domain === "fan") return fanCommand(command, entityId);
  if (domain === "vacuum") return vacuumCommand(command, entityId, values);
  if (domain === "alarm_control_panel" && ALARM_SERVICES[command.capability]) {
    // The code is read once here and never stored anywhere or logged (ADR-HEARTH-182); omitted entirely when not given, matching HA's own optional `code` parameter.
    const code = command.args?.code;
    return serviceCall("alarm_control_panel", ALARM_SERVICES[command.capability], entityId, typeof code === "string" && code ? { code } : {});
  }
  throw new HaCommandValidationError(`Home Assistant ${domain} entities only support power`);
}
