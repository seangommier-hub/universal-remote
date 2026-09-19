import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { SonosClient, SonosConfig } from "./SonosClient";

const LOG_SCOPE = "SonosDriver";
const VOLUME_STEP = 5;
// Same "don't leave a device permanently disconnected after one failed reach" pattern as
// SonyBraviaDriver/YamahaMusicCastDriver — a plain-HTTP device has no persistent connection to
// drop, so this re-checks state on a timer instead of reconnecting a socket.
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

// No "power" capability: Sonos speakers have no standby/power-off exposed on the local
// RenderingControl/AVTransport surface this driver targets (verified against SoCo, the reference
// implementation — no set_power-equivalent method exists there; a Zone Player is always reachable
// on the network). Same "never claim a capability the protocol can't back up" rule as every other
// driver here (see Capability.ts's own playPause/textEntry citations for the pattern).
const SONOS_CAPABILITIES: CapabilityId[] = ["volumeUp", "volumeDown", "setVolume", "mute", "playPause"];

export const SONOS_DRIVER_ID = "sonos";

function requireConfig(device: Device): SonosConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Sonos config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

/** ADR-HEARTH-093's playbackState field ("playing"/"paused") — same mapping RokuEcpDriver/LgWebOsDriver already use, so the now-playing widget picks this up with zero widget-side changes. Sonos's own TRANSITIONING/STOPPED states fold to "paused"/undefined since neither maps to a widget-actionable state. */
function toPlaybackState(transportState: string): "playing" | "paused" | undefined {
  if (transportState === "PLAYING") return "playing";
  if (transportState === "PAUSED_PLAYBACK" || transportState === "STOPPED") return "paused";
  return undefined;
}

/**
 * Driver for Sonos speakers over their local SOAP/UPnP control API (SonosClient.ts) — no pairing
 * step or credential of any kind, same LAN-trust model as Roku ECP/Yamaha MusicCast. Every device
 * using this driver needs `device.config = { ipAddress }` only.
 */
export class SonosDriver implements DeviceDriver {
  id = SONOS_DRIVER_ID;
  displayName = "Sonos (local control)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return SONOS_CAPABILITIES;
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
    const client = new SonosClient(requireConfig(device));
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

  private async applyCommand(client: SonosClient, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "volumeUp": {
        const current = await client.getVolume();
        await client.setVolume(Math.min(100, current + VOLUME_STEP));
        return;
      }
      case "volumeDown": {
        const current = await client.getVolume();
        await client.setVolume(Math.max(0, current - VOLUME_STEP));
        return;
      }
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new Error("setVolume requires a numeric 'volume' arg");
        await client.setVolume(target);
        return;
      }
      case "mute": {
        const muted = await client.getMute();
        await client.setMute(!muted);
        return;
      }
      case "playPause": {
        const transportState = await client.getTransportState();
        if (transportState === "PLAYING") {
          await client.pause();
        } else {
          await client.play();
        }
        return;
      }
      default:
        throw new Error(`SonosDriver does not implement capability: ${command.capability}`);
    }
  }

  /** Re-reads volume/mute/playback state from the speaker and updates cached state. Never trusts a command's own result as proof of success — always reads the state back. */
  private async refreshState(device: Device): Promise<DeviceState> {
    const generation = this.generations.get(device.id) ?? 0;
    const client = new SonosClient(requireConfig(device));
    try {
      const [volume, muted, transportState] = await Promise.all([client.getVolume(), client.getMute(), client.getTransportState()]);
      const current = this.states.get(device.id);
      const playbackState = toPlaybackState(transportState);
      const state: DeviceState = {
        connection: "connected",
        values: {
          ...current?.values,
          volume,
          muted,
          ...(playbackState ? { playbackState } : {}),
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
