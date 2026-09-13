import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { YamahaMusicCastClient, YamahaMusicCastConfig } from "./YamahaMusicCastClient";

const LOG_SCOPE = "YamahaMusicCastDriver";
const VOLUME_STEP = 5; // MusicCast's own volume scale commonly runs 0-100/0-161 depending on model — a fixed step in Sony's absolute-volume-units sense doesn't apply the same way, but a flat step still reads sensibly as a proportion of whatever max_volume this device reports.
// Same "don't leave a device permanently disconnected after one failed reach" pattern as
// SonyBraviaDriver/RokuEcpDriver — a plain-HTTP device has no persistent connection to drop, so
// this re-checks state on a timer instead of reconnecting a socket.
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

// Real capabilities against Yamaha's documented Extended Control API (ADR-HEARTH-054) — no
// directional-nav/select/back/home/menu equivalent exists in this API, same gap Sony's REST API
// has (that lives in a separate, unimplemented protocol for Sony; MusicCast has no such surface at
// all since it's an AV receiver, not a TV with an on-screen UI to navigate).
const YAMAHA_MUSICCAST_CAPABILITIES: CapabilityId[] = ["power", "volumeUp", "volumeDown", "setVolume", "mute", "inputSelection"];

export const YAMAHA_MUSICCAST_DRIVER_ID = "yamaha-musiccast";

function requireConfig(device: Device): YamahaMusicCastConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Yamaha MusicCast config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

/**
 * Driver for Yamaha MusicCast AV receivers/soundbars over Yamaha's official, unauthenticated local
 * "Extended Control" HTTP/JSON API (ADR-HEARTH-054) — the same LAN-trust model as Roku ECP, no
 * pairing step or credential of any kind. Every device using this driver needs
 * `device.config = { ipAddress }` only.
 */
export class YamahaMusicCastDriver implements DeviceDriver {
  id = YAMAHA_MUSICCAST_DRIVER_ID;
  displayName = "Yamaha MusicCast (Extended Control API)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return YAMAHA_MUSICCAST_CAPABILITIES;
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
    await this.refreshInputList(device);
  }

  /** Real input ids for this specific device, read live off it — never hardcoded, same pattern as LG/Sony. Best-effort: a device that rejects this leaves the UI on no input list rather than failing connect(). */
  private async refreshInputList(device: Device): Promise<void> {
    try {
      const client = new YamahaMusicCastClient(requireConfig(device));
      const inputs = await client.getAvailableInputs();
      if (inputs.length > 0) {
        const current = this.states.get(device.id);
        const inputOptions = inputs.map((id) => ({ id, label: formatInputLabel(id) }));
        this.setState(device.id, { connection: "connected", values: { ...current?.values, inputs: inputOptions }, lastUpdated: Date.now() });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not read input list for ${device.name}`, { message });
    }
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

  // Real-hardware finding, ADR-HEARTH-052 (found live tonight against LgWebOsDriver, same root
  // cause here in principle): a failed connect() must not leave a reconnect loop that nothing else
  // will ever stop. disconnect() already tears down this device's own timer/generation below; the
  // Add-device screen for this driver calls disconnect() on a failed provisional attempt the same
  // way AddLgDeviceScreen now does, so the same leak can't recur here.
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
    const client = new YamahaMusicCastClient(requireConfig(device));
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

  private async applyCommand(client: YamahaMusicCastClient, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "power": {
        const status = await client.getStatus();
        await client.setPower(status.power !== "on");
        return;
      }
      case "volumeUp": {
        const status = await client.getStatus();
        await client.setVolume(Math.min(status.max_volume, status.volume + VOLUME_STEP));
        return;
      }
      case "volumeDown": {
        const status = await client.getStatus();
        await client.setVolume(Math.max(0, status.volume - VOLUME_STEP));
        return;
      }
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new Error("setVolume requires a numeric 'volume' arg");
        await client.setVolume(target);
        return;
      }
      case "mute": {
        const status = await client.getStatus();
        await client.setMute(!status.mute);
        return;
      }
      case "inputSelection": {
        const input = command.args?.input;
        if (typeof input !== "string") throw new Error("inputSelection requires a string 'input' arg");
        await client.setInput(input);
        return;
      }
      default:
        throw new Error(`YamahaMusicCastDriver does not implement capability: ${command.capability}`);
    }
  }

  /** Re-reads power/volume/mute/input from the receiver and updates cached state. Never trusts a command's own result as proof of success — always reads the state back. */
  private async refreshState(device: Device): Promise<DeviceState> {
    const generation = this.generations.get(device.id) ?? 0;
    const client = new YamahaMusicCastClient(requireConfig(device));
    try {
      const status = await client.getStatus();
      const current = this.states.get(device.id);
      const state: DeviceState = {
        connection: "connected",
        values: {
          ...current?.values,
          power: status.power === "on" ? "on" : "off",
          volume: status.volume,
          muted: status.mute,
          input: status.input,
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

// MusicCast's raw input ids are lowercase/underscored machine names (e.g. "hdmi1", "audio1",
// "av1", "main_zone_sync", "net_radio") — title-cased with underscores turned to spaces for
// display, same "read live, format for humans" treatment as every other driver's input list.
function formatInputLabel(id: string): string {
  return id
    .split("_")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}
