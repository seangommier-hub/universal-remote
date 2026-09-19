import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { ChromecastClient } from "./ChromecastClient";

const LOG_SCOPE = "ChromecastDriver";
// A reasonable default step (5%), not a protocol-mandated value — CastV2 has no documented
// "volume step" concept of its own (every real sender just sets an absolute level), same
// treatment SonosDriver.ts's own VOLUME_STEP already gets for the identical reason.
const VOLUME_STEP = 0.05;
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

// No "power", no playPause: verified against home-assistant-libs/pychromecast that a Chromecast
// has no standby concept on its receiver-level control surface (always network-listening, same
// as Sonos), and that play/pause needs a currently-running app's own session/transport id (a
// separate, bigger lookup this driver's client doesn't implement) — never claim a capability the
// protocol can't back up, same rule every other driver here follows.
const CHROMECAST_CAPABILITIES: CapabilityId[] = ["volumeUp", "volumeDown", "setVolume", "mute"];

export const CHROMECAST_DRIVER_ID = "chromecast";

function requireIpAddress(device: Device): string {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Chromecast config (config.ipAddress) — pair it first`);
  }
  return ipAddress;
}

/**
 * Driver for Chromecast devices over Family Command Center's CastV2 relay (ChromecastClient.ts) —
 * relayed rather than direct from the phone (see that file's own doc comment for why). Every
 * device using this driver needs `device.config = { ipAddress }` only. Volume is the protocol's
 * own native 0.0-1.0 scale, not normalized to 0-100 — confirmed safe the same way Denon's own
 * native dB scale was: `state.values.volume` renders as plain text, never a 0-100 slider.
 */
export class ChromecastDriver implements DeviceDriver {
  id = CHROMECAST_DRIVER_ID;
  displayName = "Chromecast (via Family Command Center)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return CHROMECAST_CAPABILITIES;
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
    const client = new ChromecastClient();
    const ipAddress = requireIpAddress(device);
    const state = await this.applyCommand(client, ipAddress, command);
    const current = this.states.get(device.id);
    const newState: DeviceState = {
      connection: "connected",
      values: { ...current?.values, volume: state.volumeLevel, muted: state.muted },
      lastUpdated: Date.now(),
    };
    this.setState(device.id, newState);
    return {
      success: true,
      deviceId: device.id,
      capability: command.capability,
      timestamp: Date.now(),
      state: newState.values,
    };
  }

  subscribeToState(device: Device, listener: StateChangeListener): () => void {
    const set = this.listeners.get(device.id) ?? new Set<StateChangeListener>();
    set.add(listener);
    this.listeners.set(device.id, set);
    return () => set.delete(listener);
  }

  private async applyCommand(client: ChromecastClient, ipAddress: string, command: Command) {
    switch (command.capability) {
      case "volumeUp": {
        const current = await client.getStatus(ipAddress);
        return client.setVolume(ipAddress, Math.min(1, current.volumeLevel + VOLUME_STEP));
      }
      case "volumeDown": {
        const current = await client.getStatus(ipAddress);
        return client.setVolume(ipAddress, Math.max(0, current.volumeLevel - VOLUME_STEP));
      }
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new Error("setVolume requires a numeric 'volume' arg (the protocol's own 0.0-1.0 scale)");
        return client.setVolume(ipAddress, target);
      }
      case "mute": {
        const current = await client.getStatus(ipAddress);
        return client.setMute(ipAddress, !current.muted);
      }
      default:
        throw new Error(`ChromecastDriver does not implement capability: ${command.capability}`);
    }
  }

  /** Re-reads volume/mute from the device and updates cached state. Never trusts a command's own result as proof of success — always reads the state back. */
  private async refreshState(device: Device): Promise<DeviceState> {
    const generation = this.generations.get(device.id) ?? 0;
    const client = new ChromecastClient();
    const ipAddress = requireIpAddress(device);
    try {
      const status = await client.getStatus(ipAddress);
      const current = this.states.get(device.id);
      const state: DeviceState = {
        connection: "connected",
        values: { ...current?.values, volume: status.volumeLevel, muted: status.muted },
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
