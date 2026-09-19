import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { DenonClient, DenonConfig } from "./DenonClient";

const LOG_SCOPE = "DenonDriver";
const VOLUME_STEP_DB = 0.5; // Denon's own remote/app step size for a single MVUP/MVDOWN press
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

// No playPause, no inputSelection: verified against denonavr (the reference implementation) that
// there's no playback-state field in the status endpoint this client reads (NS9A/NS9B are
// fire-and-forget Play/Pause commands, not a single self-toggling key like Roku's own Play
// button — implementing a toggle would need to already know current state, which isn't available
// here), and no verified real input-code list for the specific receiver model this connects to.
// Same "never claim a capability the protocol can't back up, never guess a value" rule as every
// other driver here.
const DENON_CAPABILITIES: CapabilityId[] = ["power", "volumeUp", "volumeDown", "setVolume", "mute"];

export const DENON_DRIVER_ID = "denon-marantz";

function requireConfig(device: Device): DenonConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Denon/Marantz config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

/**
 * Driver for Denon/Marantz AV receivers over their legacy "formiPhoneApp" HTTP control surface
 * (DenonClient.ts) — no pairing step or credential of any kind, same LAN-trust model as Roku
 * ECP/Yamaha MusicCast/Sonos. Every device using this driver needs `device.config = { ipAddress }`
 * only. Volume is the receiver's own native dB scale (see DenonClient.ts's doc comment) — not
 * normalized to 0-100 like some other drivers, since that would need a per-model max-volume
 * ceiling this client has no verified way to read.
 */
export class DenonDriver implements DeviceDriver {
  id = DENON_DRIVER_ID;
  displayName = "Denon/Marantz (formiPhoneApp)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return DENON_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const existing = this.inFlightConnects.get(device.id);
    if (existing) return existing;
    const attempt = this.doConnect(device);
    this.inFlightConnects.set(device.id, attempt);
    try {
      await attempt;
    } finally {
      if (this.inFlightConnects.get(device.id) === attempt) this.inFlightConnects.delete(device.id);
    }
  }

  private async doConnect(device: Device): Promise<void> {
    this.clearReconnectTimer(device.id);
    await this.refreshState(device);
  }

  private scheduleReconnect(device: Device, attempt = 1): void {
    if (attempt === 1 && this.reconnectTimers.has(device.id)) return;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);
    logger.warn(LOG_SCOPE, `${device.name} unreachable — retrying in ${delay / 1000}s (attempt ${attempt})`);
    const timer = setTimeout(async () => {
      try {
        await this.refreshState(device);
        logger.info(LOG_SCOPE, `${device.name} reachable again after ${attempt} attempt(s)`);
      } catch {
        this.scheduleReconnect(device, attempt + 1);
      }
    }, delay);
    this.reconnectTimers.set(device.id, timer);
  }

  private clearReconnectTimer(deviceId: string): void {
    const timer = this.reconnectTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(deviceId);
    }
  }

  async disconnect(device: Device): Promise<void> {
    this.generations.set(device.id, (this.generations.get(device.id) ?? 0) + 1);
    this.clearReconnectTimer(device.id);
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const client = new DenonClient(requireConfig(device));
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

  private async applyCommand(client: DenonClient, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "power": {
        const status = await client.getStatus();
        if (status.power === "ON") {
          await client.powerStandby();
        } else {
          await client.powerOn();
        }
        return;
      }
      case "volumeUp":
        await client.volumeUp();
        return;
      case "volumeDown":
        await client.volumeDown();
        return;
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new Error("setVolume requires a numeric 'volume' arg (the receiver's own dB scale)");
        await client.setVolume(target);
        return;
      }
      case "mute": {
        const status = await client.getStatus();
        await client.setMute(!status.muted);
        return;
      }
      default:
        throw new Error(`DenonDriver does not implement capability: ${command.capability}`);
    }
  }

  /** Re-reads power/volume/mute from the receiver and updates cached state. Never trusts a command's own result as proof of success — always reads the state back. */
  private async refreshState(device: Device): Promise<DeviceState> {
    const generation = this.generations.get(device.id) ?? 0;
    const client = new DenonClient(requireConfig(device));
    try {
      const status = await client.getStatus();
      const current = this.states.get(device.id);
      const state: DeviceState = {
        connection: "connected",
        values: {
          ...current?.values,
          power: status.power === "ON" ? "on" : "off",
          volume: status.volumeDb,
          muted: status.muted,
        },
        lastUpdated: Date.now(),
      };
      if (generation !== (this.generations.get(device.id) ?? 0)) return state;
      this.clearReconnectTimer(device.id);
      this.setState(device.id, state);
      return state;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Failed to reach ${device.name} at ${device.config?.ipAddress}`, { message });
      if (generation !== (this.generations.get(device.id) ?? 0)) throw err;
      const state: DeviceState = { connection: "disconnected", values: this.states.get(device.id)?.values ?? {}, lastUpdated: Date.now() };
      this.setState(device.id, state);
      this.scheduleReconnect(device);
      throw err;
    }
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
