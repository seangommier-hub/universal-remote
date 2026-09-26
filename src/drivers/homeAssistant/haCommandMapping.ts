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

/** Maps a Hearth command to the Home Assistant service call that performs it for one entity. */
export function commandToServiceCall(command: Command, entityId: string, values: Record<string, unknown>): HaServiceCall {
  const domain = domainOf(entityId);
  const powerServices: Record<string, string> = { power: "toggle", powerOn: "turn_on", powerOff: "turn_off" };
  const powerService = powerServices[command.capability];
  if (powerService) return { domain, service: powerService, data: { entity_id: entityId } };
  if (domain === "media_player") return mediaPlayerCommand(command, entityId, values);
  if (domain === "light") return lightCommand(command, entityId);
  if (domain === "remote") return remoteCommand(command, entityId);
  throw new HaCommandValidationError(`Home Assistant ${domain} entities only support power`);
}
