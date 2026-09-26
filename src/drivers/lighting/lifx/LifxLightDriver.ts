import { CapabilityId } from "../../../core/types/Capability";
import { Command } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { InvalidCommandError, PerRequestDriver, requireIpAddress } from "../../shared/PerRequestDriver";
import { LifxState, getLifxState, setLifxColor, setLifxPower } from "./LifxClient";

export const LIFX_LIGHT_DRIVER_ID = "lifx-light";

const LIFX_CAPABILITIES: CapabilityId[] = ["power", "setBrightness", "setColor"];
const HUE_MAX = 360;
const PERCENT_MAX = 100;

function valuesFromState(state: LifxState): DeviceState["values"] {
  const values: DeviceState["values"] = {};
  if (state.power !== undefined) values.power = state.power ? "on" : "off";
  if (state.brightness !== undefined) values.brightness = state.brightness;
  if (state.hue !== undefined) values.hue = state.hue;
  if (state.saturation !== undefined) values.saturation = state.saturation;
  if (state.label) values.deviceName = state.label;
  return values;
}

function numberArg(command: Command, key: string, max: number): number {
  const value = command.args?.[key];
  if (typeof value !== "number" || Number.isNaN(value)) throw new InvalidCommandError(`${command.capability} requires a numeric '${key}' arg (0-${max})`);
  return Math.min(Math.max(value, 0), max);
}

/** Driver for LIFX bulbs (on/off, brightness, colour), reached through Family Command Center's UDP proxy (see LifxClient.ts). */
export class LifxLightDriver extends PerRequestDriver {
  id = LIFX_LIGHT_DRIVER_ID;
  displayName = "LIFX";
  protected readonly logScope = "LifxLightDriver";

  getCapabilities(): CapabilityId[] {
    return LIFX_CAPABILITIES;
  }

  protected async readValues(device: Device): Promise<DeviceState["values"]> {
    return valuesFromState(await getLifxState(requireIpAddress(device, "LIFX bulb")));
  }

  protected async perform(device: Device, command: Command, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    const ipAddress = requireIpAddress(device, "LIFX bulb");
    switch (command.capability) {
      case "power":
        await setLifxPower(ipAddress, current.power !== "on");
        break;
      case "setBrightness":
        await setLifxColor(ipAddress, { brightness: numberArg(command, "brightness", PERCENT_MAX) });
        await setLifxPower(ipAddress, true);
        break;
      case "setColor":
        await setLifxColor(ipAddress, { hue: numberArg(command, "hue", HUE_MAX), saturation: numberArg(command, "saturation", PERCENT_MAX) });
        await setLifxPower(ipAddress, true);
        break;
      default:
        throw new InvalidCommandError(`${this.displayName} does not implement capability: ${command.capability}`);
    }
    return valuesFromState(await getLifxState(ipAddress));
  }
}
