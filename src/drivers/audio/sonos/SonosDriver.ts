import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { SonosClient, SonosConfig } from "./SonosClient";
import { findMovedAddress, backfillHwaddr } from "../../shared/selfHeal";
import { withBackoffJitter } from "../../shared/backoffJitter";
import { CommandValidationError, runCommandTrackingReachability } from "../../shared/commandFailure";

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
    const delay = withBackoffJitter(Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS));
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
    // Captured before applyCommand's own await, mirroring refreshState's identical guard below —
    // a disconnect() racing with this in-flight command must not have its own "disconnected" state
    // clobbered by this command's optimistic patch landing afterward (ADR-HEARTH-179).
    const generation = this.generations.get(device.id) ?? 0;
    const client = new SonosClient(requireConfig(device));
    // ADR-HEARTH-179: every command below already reads current state to compute an exact target
    // (a toggle, or a volume clamped to 0-100) or is itself an exact set, so applyCommand's own
    // patch always fully describes the result — no refreshState() read-back follows it anymore.
    const patch = await runCommandTrackingReachability(
      () => this.applyCommand(client, device, command),
      () => this.markUnreachableAfterCommandFailure(device, generation)
    );
    const state = this.markConnected(device, generation, patch);
    return {
      success: true,
      deviceId: device.id,
      capability: command.capability,
      timestamp: Date.now(),
      state: state.values,
    };
  }

  /** Marks the device disconnected and starts the reconnect loop after a command failed on the wire (connection contract, ADR-HEARTH-171). */
  private markUnreachableAfterCommandFailure(device: Device, generation: number): void {
    if (generation !== (this.generations.get(device.id) ?? 0)) return; // disconnected in the meantime
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
    this.scheduleReconnect(device);
  }

  /** Merges `patch` into cached values and marks the device connected, with no network round trip
   * — reaching this point means the command itself just succeeded, so the device is provably
   * reachable right now (ADR-HEARTH-179). The result is always returned for a truthful
   * CommandResult, but only committed to cached state if `generation` is still current — an
   * explicit disconnect() that raced with this command already set its own, more correct
   * "disconnected" state, and must win. */
  private markConnected(device: Device, generation: number, patch: DeviceState["values"]): DeviceState {
    const current = this.states.get(device.id);
    const state: DeviceState = { connection: "connected", values: { ...current?.values, ...patch }, lastUpdated: Date.now() };
    if (generation !== (this.generations.get(device.id) ?? 0)) return state;
    this.clearReconnectTimer(device.id);
    this.setState(device.id, state);
    return state;
  }


  subscribeToState(device: Device, listener: StateChangeListener): () => void {
    const set = this.listeners.get(device.id) ?? new Set<StateChangeListener>();
    set.add(listener);
    this.listeners.set(device.id, set);
    return () => set.delete(listener);
  }

  /** Returns the resulting `values` patch — every branch below either already read current state
   * to compute an exact target (a toggle, or a volume clamped to 0-100) or is itself an exact set,
   * so the value we just sent IS the new state (ADR-HEARTH-179); no branch here needs a separate
   * read-back. */
  private async applyCommand(client: SonosClient, device: Device, command: Command): Promise<DeviceState["values"]> {
    switch (command.capability) {
      case "volumeUp": {
        const current = await client.getVolume();
        const target = Math.min(100, current + VOLUME_STEP);
        await client.setVolume(target);
        return { volume: target };
      }
      case "volumeDown": {
        const current = await client.getVolume();
        const target = Math.max(0, current - VOLUME_STEP);
        await client.setVolume(target);
        return { volume: target };
      }
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new CommandValidationError("setVolume requires a numeric 'volume' arg");
        await client.setVolume(target);
        return { volume: target };
      }
      case "mute": {
        const muted = await client.getMute();
        const nextMuted = !muted;
        await client.setMute(nextMuted);
        return { muted: nextMuted };
      }
      case "playPause": {
        const transportState = await client.getTransportState();
        const nowPlaying = transportState !== "PLAYING";
        if (nowPlaying) {
          await client.play();
        } else {
          await client.pause();
        }
        return { playbackState: nowPlaying ? "playing" : "paused" };
      }
      default:
        throw new CommandValidationError(`SonosDriver does not implement capability: ${command.capability}`);
    }
  }

  /** Raw, unhandled read of volume/mute/transport state — no self-healing, no retry. Split out
   * purely so `fetchLiveStateWithSelfHeal` below can attempt it twice (original IP, then a
   * rediscovered one) without recursing into `refreshState`'s own disconnect/backoff bookkeeping. */
  private async fetchLiveState(device: Device): Promise<{ volume: number; muted: boolean; transportState: string }> {
    const client = new SonosClient(requireConfig(device));
    const [volume, muted, transportState] = await Promise.all([client.getVolume(), client.getMute(), client.getTransportState()]);
    return { volume, muted, transportState };
  }

  /**
   * Real gap found live (2026-09-21, ADR-HEARTH-120): mirrors LgWebOsDriver.ts's/RokuEcpDriver.ts's/
   * SonyBraviaDriver.ts's identical self-healing (ADR-HEARTH-017/109/119) — a speaker that moves to
   * a different network kept retrying the same dead IP forever. On any reachability failure, check
   * whether Family Command Center currently sees this device's MAC at a different address, retry
   * once at whatever it finds. Safe to try unconditionally.
   */
  private async fetchLiveStateWithSelfHeal(device: Device): Promise<{ volume: number; muted: boolean; transportState: string }> {
    try {
      return await this.fetchLiveState(device);
    } catch (err) {
      const hwaddr = device.config?.hwaddr;
      const currentIp = device.config?.ipAddress;
      if (typeof currentIp !== "string") throw err;
      logger.warn(LOG_SCOPE, `${device.name} failed to reach ${currentIp} — checking Family Command Center for its current address`);
      const freshIp = await findMovedAddress(device);
      if (!freshIp || freshIp === currentIp) throw err;
      logger.info(LOG_SCOPE, `${device.name} found at a new address: ${currentIp} -> ${freshIp} — retrying`);
      if (device.config) device.config.ipAddress = freshIp;
      await backfillHwaddr(device, freshIp);
      return await this.fetchLiveState(device);
    }
  }

  /** Re-reads volume/mute/playback state from the speaker and updates cached state. Never trusts a command's own result as proof of success — always reads the state back. */
  private async refreshState(device: Device): Promise<DeviceState> {
    const generation = this.generations.get(device.id) ?? 0;
    try {
      const { volume, muted, transportState } = await this.fetchLiveStateWithSelfHeal(device);
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
