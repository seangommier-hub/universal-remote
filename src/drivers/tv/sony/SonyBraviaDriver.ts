import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { SonyBraviaClient, SonyBraviaConfig } from "./SonyBraviaClient";

const LOG_SCOPE = "SonyBraviaDriver";
const VOLUME_STEP = 2;

// Capabilities this driver actually implements against Sony's documented JSON-RPC API. Sony's
// REST API has no method for directional nav/select/back/home/menu — those live in the separate
// IRCC-IP protocol, which is NOT implemented here yet. Do not add those capabilities to a Sony
// device until IRCC-IP is researched and implemented; a device must never claim a capability its
// driver can't actually perform.
const SONY_BRAVIA_CAPABILITIES: CapabilityId[] = ["power", "volumeUp", "volumeDown", "setVolume", "mute", "inputSelection"];

export const SONY_BRAVIA_DRIVER_ID = "sony-bravia";

interface PowerStatus {
  status: "active" | "standby";
}

interface VolumeInfo {
  target: string;
  volume: number;
  mute: boolean;
  maxVolume: number;
  minVolume: number;
}

function requireConfig(device: Device): SonyBraviaConfig {
  const ipAddress = device.config?.ipAddress;
  const psk = device.config?.psk;
  if (typeof ipAddress !== "string" || typeof psk !== "string") {
    throw new Error(`Device ${device.id} is missing Sony BRAVIA config (config.ipAddress and config.psk) — pair it first`);
  }
  return { ipAddress, psk };
}

function parseHdmiInput(input: string): string {
  const match = /^hdmi(\d+)$/i.exec(input);
  if (!match) {
    throw new Error(`Unrecognized Sony input '${input}' — expected a value like 'hdmi1'`);
  }
  return `extInput:hdmi?port=${match[1]}`;
}

/**
 * Driver for Sony BRAVIA TVs with "IP Control" enabled, against the official REST API
 * (https://pro-bravia.sony.net/remote-display-control/rest-api/). Every device using this
 * driver needs `device.config = { ipAddress, psk }` from the TV's IP Control settings.
 */
export class SonyBraviaDriver implements DeviceDriver {
  id = SONY_BRAVIA_DRIVER_ID;
  displayName = "Sony BRAVIA (REST API)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return SONY_BRAVIA_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    await this.refreshState(device);
  }

  async disconnect(device: Device): Promise<void> {
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const client = new SonyBraviaClient(requireConfig(device));
    await this.applyCommand(client, device, command);
    const state = await this.refreshState(device);
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

  private async applyCommand(client: SonyBraviaClient, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "power": {
        const [power] = await client.call<PowerStatus[]>("system", "getPowerStatus");
        await client.call("system", "setPowerStatus", [{ status: power.status !== "active" }]);
        return;
      }
      case "volumeUp":
        await client.call("audio", "setAudioVolume", [{ target: "speaker", volume: `+${VOLUME_STEP}` }]);
        return;
      case "volumeDown":
        await client.call("audio", "setAudioVolume", [{ target: "speaker", volume: `-${VOLUME_STEP}` }]);
        return;
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new Error("setVolume requires a numeric 'volume' arg");
        await client.call("audio", "setAudioVolume", [{ target: "speaker", volume: String(target) }]);
        return;
      }
      case "mute": {
        const [info] = await client.call<VolumeInfo[]>("audio", "getVolumeInformation");
        await client.call("audio", "setAudioMute", [{ status: !info.mute }]);
        return;
      }
      case "inputSelection": {
        const input = command.args?.input;
        if (typeof input !== "string") throw new Error("inputSelection requires a string 'input' arg");
        await client.call("avContent", "setPlayContent", [{ uri: parseHdmiInput(input) }]);
        return;
      }
      default:
        throw new Error(`SonyBraviaDriver does not implement capability: ${command.capability}`);
    }
  }

  /** Re-reads power + volume from the TV and updates cached state. Never trusts a command's own result as proof of success — always reads the state back. */
  private async refreshState(device: Device): Promise<DeviceState> {
    const client = new SonyBraviaClient(requireConfig(device));
    try {
      const [[power], [volumeInfo]] = await Promise.all([
        client.call<PowerStatus[]>("system", "getPowerStatus"),
        client.call<VolumeInfo[]>("audio", "getVolumeInformation"),
      ]);
      const state: DeviceState = {
        connection: "connected",
        values: {
          power: power.status === "active" ? "on" : "off",
          volume: volumeInfo.volume,
          muted: volumeInfo.mute,
        },
        lastUpdated: Date.now(),
      };
      this.setState(device.id, state);
      return state;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Failed to reach ${device.name} at ${device.config?.ipAddress}`, { message });
      const state: DeviceState = { connection: "disconnected", values: this.states.get(device.id)?.values ?? {}, lastUpdated: Date.now() };
      this.setState(device.id, state);
      throw err;
    }
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
