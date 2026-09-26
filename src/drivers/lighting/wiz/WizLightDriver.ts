import { CapabilityId } from "../../../core/types/Capability";
import { Command } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { hueSaturationToRgb, rgbToHueSaturation } from "../../shared/colorConversion";
import { InvalidCommandError, PerRequestDriver, requireIpAddress } from "../../shared/PerRequestDriver";
import { WIZ_MAX_DIMMING, WIZ_MIN_DIMMING, WizPilot, getPilot, setPilot } from "./WizClient";

export const WIZ_LIGHT_DRIVER_ID = "wiz-light";

const WIZ_CAPABILITIES: CapabilityId[] = ["power", "setBrightness", "setColor"];
const HUE_MAX = 360;
const PERCENT_MAX = 100;

function valuesFromPilot(pilot: WizPilot): DeviceState["values"] {
  const values: DeviceState["values"] = {};
  if (pilot.state !== undefined) values.power = pilot.state ? "on" : "off";
  if (pilot.dimming !== undefined) values.brightness = pilot.dimming;
  if (pilot.r !== undefined && pilot.g !== undefined && pilot.b !== undefined) {
    Object.assign(values, rgbToHueSaturation({ r: pilot.r, g: pilot.g, b: pilot.b }));
  }
  return values;
}

function numberArg(command: Command, key: string, min: number, max: number): number {
  const value = command.args?.[key];
  if (typeof value !== "number" || Number.isNaN(value)) throw new InvalidCommandError(`${command.capability} requires a numeric '${key}' arg (${min}-${max})`);
  return Math.min(Math.max(value, min), max);
}

/** Driver for Wiz smart bulbs (on/off, brightness, colour), reached through Family Command Center's UDP proxy (see WizClient.ts). */
export class WizLightDriver extends PerRequestDriver {
  id = WIZ_LIGHT_DRIVER_ID;
  displayName = "Wiz";
  protected readonly logScope = "WizLightDriver";

  getCapabilities(): CapabilityId[] {
    return WIZ_CAPABILITIES;
  }

  protected async readValues(device: Device): Promise<DeviceState["values"]> {
    return valuesFromPilot(await getPilot(requireIpAddress(device, "Wiz bulb")));
  }

  protected async perform(device: Device, command: Command, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    const ipAddress = requireIpAddress(device, "Wiz bulb");
    switch (command.capability) {
      case "power":
        await setPilot(ipAddress, { state: current.power !== "on" });
        break;
      case "setBrightness":
        await setPilot(ipAddress, { state: true, dimming: this.dimmingFrom(command) });
        break;
      case "setColor": {
        const hue = numberArg(command, "hue", 0, HUE_MAX);
        const saturation = numberArg(command, "saturation", 0, PERCENT_MAX);
        await setPilot(ipAddress, { state: true, ...hueSaturationToRgb(hue, saturation) });
        break;
      }
      default:
        throw new InvalidCommandError(`${this.displayName} does not implement capability: ${command.capability}`);
    }
    return valuesFromPilot(await getPilot(ipAddress));
  }

  private dimmingFrom(command: Command): number {
    return Math.round(numberArg(command, "brightness", WIZ_MIN_DIMMING, WIZ_MAX_DIMMING));
  }
}
