import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId, NavigationDirection } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { RokuEcpClient, RokuEcpConfig } from "./RokuEcpClient";

const LOG_SCOPE = "RokuEcpDriver";
export const ROKU_ECP_DRIVER_ID = "roku-ecp";

// No "power"/"powerOn" — Roku's documented key list has only "PowerOff", no power-on key (waking
// a fully-off device isn't exposed by ECP). No "setVolume" — volume keys are relative
// (VolumeUp/VolumeDown) only, no absolute-value command. No "menu" — Roku's key list has no
// confirmed menu/options key mapping. inputSelection IS included, unlike the TV drivers: ECP
// documents explicit InputTuner/InputHDMI1-4/InputAV1 keys, so this one is real, not a gap.
// See ADR-HEARTH-007.
const ROKU_CAPABILITIES: CapabilityId[] = [
  "powerOff",
  "volumeUp",
  "volumeDown",
  "mute",
  "channelUp",
  "channelDown",
  "directionalNavigation",
  "select",
  "back",
  "home",
  "inputSelection",
];

const DIRECTION_KEYS: Record<NavigationDirection, string> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
};

function requireConfig(device: Device): RokuEcpConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Roku config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

function inputKeyFor(input: string): string {
  if (input === "tuner") return "InputTuner";
  if (input === "av1") return "InputAV1";
  const match = /^hdmi([1-4])$/i.exec(input);
  if (match) return `InputHDMI${match[1]}`;
  throw new Error(`Unrecognized Roku input '${input}' — expected 'tuner', 'av1', or 'hdmi1'..'hdmi4'`);
}

/**
 * Driver for Roku streaming devices and Roku TVs (they share the same ECP interface) over
 * plain HTTP — no pairing, no auth, no TLS/certificate issues like the Samsung/LG drivers hit.
 * Sourced directly from Roku's own developer documentation (ADR-HEARTH-007), not community
 * reverse-engineering.
 */
export class RokuEcpDriver implements DeviceDriver {
  id = ROKU_ECP_DRIVER_ID;
  displayName = "Roku (ECP)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return ROKU_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const client = new RokuEcpClient(requireConfig(device));
    const info = await client.getDeviceInfo();
    this.setState(device.id, {
      connection: "connected",
      values: { power: info.powerMode === "PowerOn" ? "on" : "off", model: info.modelName },
      lastUpdated: Date.now(),
    });
  }

  async disconnect(device: Device): Promise<void> {
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const client = new RokuEcpClient(requireConfig(device));
    await this.applyCommand(client, device, command);
    const state = this.states.get(device.id) ?? { connection: "connected", values: {}, lastUpdated: Date.now() };
    return {
      success: true,
      deviceId: device.id,
      capability: command.capability,
      timestamp: Date.now(),
      state: state.values,
    };
  }

  subscribeToState(device: Device, listener: StateChangeListener): () => void {
    const set = this.listeners.get(device.id) ?? new Set<StateChangeListener>();
    set.add(listener);
    this.listeners.set(device.id, set);
    return () => set.delete(listener);
  }

  private async applyCommand(client: RokuEcpClient, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "powerOff":
        await client.keypress("PowerOff");
        await this.refreshPowerState(device, client, "off");
        return;
      case "volumeUp":
        await client.keypress("VolumeUp");
        this.patchValues(device.id, { lastAction: "volumeUp" });
        return;
      case "volumeDown":
        await client.keypress("VolumeDown");
        this.patchValues(device.id, { lastAction: "volumeDown" });
        return;
      case "mute":
        await client.keypress("VolumeMute");
        this.patchValues(device.id, { muted: !this.states.get(device.id)?.values.muted });
        return;
      case "channelUp":
        await client.keypress("ChannelUp");
        this.patchValues(device.id, { lastAction: "channelUp" });
        return;
      case "channelDown":
        await client.keypress("ChannelDown");
        this.patchValues(device.id, { lastAction: "channelDown" });
        return;
      case "select":
        await client.keypress("Select");
        this.patchValues(device.id, { lastAction: "select" });
        return;
      case "back":
        await client.keypress("Back");
        this.patchValues(device.id, { lastAction: "back" });
        return;
      case "home":
        await client.keypress("Home");
        this.patchValues(device.id, { lastAction: "home" });
        return;
      case "directionalNavigation": {
        const direction = command.args?.direction as NavigationDirection | undefined;
        if (!direction || !(direction in DIRECTION_KEYS)) {
          throw new Error("directionalNavigation requires a valid 'direction' arg");
        }
        await client.keypress(DIRECTION_KEYS[direction]);
        this.patchValues(device.id, { lastNavigation: direction });
        return;
      }
      case "inputSelection": {
        const input = command.args?.input;
        if (typeof input !== "string") throw new Error("inputSelection requires a string 'input' arg");
        await client.keypress(inputKeyFor(input));
        this.patchValues(device.id, { input });
        return;
      }
      default:
        throw new Error(`RokuEcpDriver does not implement capability: ${command.capability}`);
    }
  }

  private async refreshPowerState(device: Device, client: RokuEcpClient, fallback: "on" | "off"): Promise<void> {
    try {
      const info = await client.getDeviceInfo();
      this.patchValues(device.id, { power: info.powerMode === "PowerOn" ? "on" : "off" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not read back power state for ${device.name} after command; assuming ${fallback}`, { message });
      this.patchValues(device.id, { power: fallback });
    }
  }

  private patchValues(deviceId: string, patch: DeviceState["values"]): void {
    const current = this.states.get(deviceId);
    this.setState(deviceId, {
      connection: "connected",
      values: { ...current?.values, ...patch },
      lastUpdated: Date.now(),
    });
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
