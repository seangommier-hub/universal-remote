import { CapabilityId } from "../../../core/types/Capability";
import { Command } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { InvalidCommandError, PerRequestDriver, requireIpAddress } from "../../shared/PerRequestDriver";
import { ShellyGeneration, identifyShelly, readRelay, writeRelay } from "./ShellyClient";

export const SHELLY_RELAY_DRIVER_ID = "shelly-relay";

// A relay is on or off; dimmers, energy readings and covers are deliberately not claimed.
const SHELLY_CAPABILITIES: CapabilityId[] = ["power"];
const DEFAULT_CHANNEL = 0;

function channelOf(device: Device): number {
  const channel = device.config?.channel;
  return typeof channel === "number" && channel >= 0 ? channel : DEFAULT_CHANNEL;
}

/** Driver for Shelly relays and plugs (Gen1 and Gen2+), over plain HTTP with no pairing (see ShellyClient.ts). */
export class ShellyRelayDriver extends PerRequestDriver {
  id = SHELLY_RELAY_DRIVER_ID;
  displayName = "Shelly";
  protected readonly logScope = "ShellyRelayDriver";

  getCapabilities(): CapabilityId[] {
    return SHELLY_CAPABILITIES;
  }

  /** The saved generation, or (first contact only) asks the device and saves the answer so later calls skip that request. */
  private async resolveGeneration(device: Device, ipAddress: string): Promise<{ generation: ShellyGeneration; extras: DeviceState["values"] }> {
    const saved = device.config?.generation;
    if (saved === 1 || saved === 2) return { generation: saved, extras: {} };
    const identity = await identifyShelly(ipAddress);
    if (device.config) {
      device.config.generation = identity.generation;
      if (identity.mac && typeof device.config.hwaddr !== "string") device.config.hwaddr = identity.mac;
    }
    const extras: DeviceState["values"] = {};
    if (identity.model) extras.model = identity.model;
    if (identity.name) extras.deviceName = identity.name;
    return { generation: identity.generation, extras };
  }

  protected async readValues(device: Device): Promise<DeviceState["values"]> {
    const ipAddress = requireIpAddress(device, "Shelly");
    const { generation, extras } = await this.resolveGeneration(device, ipAddress);
    const on = await readRelay(ipAddress, generation, channelOf(device));
    return { ...extras, power: on ? "on" : "off" };
  }

  protected async perform(device: Device, command: Command, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    if (command.capability !== "power") throw new InvalidCommandError(`${this.displayName} does not implement capability: ${command.capability}`);
    const ipAddress = requireIpAddress(device, "Shelly");
    const { generation } = await this.resolveGeneration(device, ipAddress);
    const channel = channelOf(device);
    await writeRelay(ipAddress, generation, channel, current.power !== "on");
    const confirmed = await readRelay(ipAddress, generation, channel);
    return { power: confirmed ? "on" : "off" };
  }
}
