import { CapabilityId, NavigationDirection } from "../../../core/types/Capability";
import { Command } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { InvalidCommandError, PerRequestDriver, requireIpAddress } from "../../shared/PerRequestDriver";
import { VIZIO_KEYS, VIZIO_PORTS, VizioKey, VizioTarget, isPoweredOn, pressKey, readCurrentInput, readMuted, readVolume, switchInput } from "./VizioClient";

export const VIZIO_SMARTCAST_DRIVER_ID = "vizio-smartcast";

// Only what VizioClient.ts can actually send. No absolute setVolume (the TV's volume setting needs a
// hash handshake this driver does not implement) and no app launching.
const VIZIO_CAPABILITIES: CapabilityId[] = ["power", "volumeUp", "volumeDown", "mute", "inputSelection", "directionalNavigation", "select", "back", "home", "menu"];

const DIRECTION_KEYS: Record<NavigationDirection, VizioKey> = {
  up: VIZIO_KEYS.up,
  down: VIZIO_KEYS.down,
  left: VIZIO_KEYS.left,
  right: VIZIO_KEYS.right,
};

const SIMPLE_KEYS: Partial<Record<CapabilityId, VizioKey>> = {
  volumeUp: VIZIO_KEYS.volumeUp,
  volumeDown: VIZIO_KEYS.volumeDown,
  select: VIZIO_KEYS.select,
  back: VIZIO_KEYS.back,
  home: VIZIO_KEYS.home,
  menu: VIZIO_KEYS.menu,
};

function targetOf(device: Device): VizioTarget {
  const ipAddress = requireIpAddress(device, "Vizio TV");
  const authToken = device.config?.authToken;
  if (typeof authToken !== "string" || authToken.length === 0) {
    throw new Error(`${device.name} is not paired yet — add it again and enter the PIN shown on the TV`);
  }
  const port = device.config?.port;
  return { ipAddress, authToken, port: typeof port === "number" ? port : VIZIO_PORTS[0] };
}

/** Runs a read that only decorates the state; a failure leaves the value out instead of failing the whole refresh. */
async function bestEffort<T>(read: () => Promise<T | undefined>): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

/**
 * Driver for Vizio SmartCast TVs, reached through Family Command Center because the TV's HTTPS API
 * uses a self-signed certificate the phone cannot accept (see VizioClient.ts). Pairing is a PIN the
 * TV shows on screen; the resulting token is saved in the device config.
 */
export class VizioSmartCastDriver extends PerRequestDriver {
  id = VIZIO_SMARTCAST_DRIVER_ID;
  displayName = "Vizio SmartCast";
  protected readonly logScope = "VizioSmartCastDriver";

  getCapabilities(): CapabilityId[] {
    return VIZIO_CAPABILITIES;
  }

  protected async readValues(device: Device): Promise<DeviceState["values"]> {
    const target = targetOf(device);
    const on = await isPoweredOn(target);
    const values: DeviceState["values"] = { power: on ? "on" : "off" };
    if (!on) return values;
    const [volume, muted, input] = await Promise.all([bestEffort(() => readVolume(target)), bestEffort(() => readMuted(target)), bestEffort(() => readCurrentInput(target))]);
    if (volume !== undefined) values.volume = volume;
    if (muted !== undefined) values.muted = muted;
    if (input !== undefined) values.input = input;
    return values;
  }

  protected async perform(device: Device, command: Command, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    const capability = command.capability;
    const simpleKey = SIMPLE_KEYS[capability];
    if (simpleKey) {
      await pressKey(targetOf(device), simpleKey);
      return {};
    }
    switch (capability) {
      case "power":
        return this.togglePower(device, current);
      case "mute":
        return this.toggleMute(device, current);
      case "directionalNavigation":
        return this.navigate(device, command);
      case "inputSelection":
        return this.selectInput(device, command);
      default:
        throw new InvalidCommandError(`${this.displayName} does not implement capability: ${capability}`);
    }
  }

  private async togglePower(device: Device, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    const turnOff = current.power === "on";
    await pressKey(targetOf(device), turnOff ? VIZIO_KEYS.powerOff : VIZIO_KEYS.powerOn);
    return { power: turnOff ? "off" : "on" };
  }

  private async toggleMute(device: Device, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    const target = targetOf(device);
    await pressKey(target, VIZIO_KEYS.muteToggle);
    const confirmed = await bestEffort(() => readMuted(target));
    return { muted: confirmed ?? current.muted !== true };
  }

  private async navigate(device: Device, command: Command): Promise<DeviceState["values"]> {
    const direction = command.args?.direction as NavigationDirection | undefined;
    if (!direction || !(direction in DIRECTION_KEYS)) throw new InvalidCommandError("directionalNavigation requires a valid 'direction' arg");
    await pressKey(targetOf(device), DIRECTION_KEYS[direction]);
    return {};
  }

  private async selectInput(device: Device, command: Command): Promise<DeviceState["values"]> {
    const input = command.args?.input;
    if (typeof input !== "string" || input.length === 0) throw new InvalidCommandError("inputSelection requires a string 'input' arg");
    await switchInput(targetOf(device), input);
    return { input };
  }
}
