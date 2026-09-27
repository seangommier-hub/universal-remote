import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { DenonClient, DenonConfig, DenonStatus } from "./DenonClient";
import { findMovedAddress, backfillHwaddr } from "../../shared/selfHeal";
import { withBackoffJitter } from "../../shared/backoffJitter";
import { CommandValidationError, runCommandTrackingReachability } from "../../shared/commandFailure";

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
    const client = new DenonClient(requireConfig(device));
    const patch = await runCommandTrackingReachability(
      () => this.applyCommand(client, device, command),
      () => this.markUnreachableAfterCommandFailure(device, generation)
    );
    // ADR-HEARTH-179: power/mute/setVolume already know their own resulting value (power/mute
    // from the pre-toggle read applyCommand had to make anyway; setVolume from the exact value we
    // just sent) — only volumeUp/volumeDown (a relative dB step, undefined patch) still need the
    // one real getStatus() round trip refreshState makes.
    const state = patch ? this.markConnected(device, generation, patch) : await this.refreshState(device);
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

  /** Returns the resulting `values` patch when the command's own (possibly load-bearing) read
   * already tells us it, or `undefined` when only a real read-back (refreshState) can (a relative
   * volume step whose resulting dB level the receiver's own command response doesn't carry) —
   * ADR-HEARTH-179. */
  private async applyCommand(client: DenonClient, device: Device, command: Command): Promise<DeviceState["values"] | undefined> {
    switch (command.capability) {
      case "power": {
        // This read is load-bearing (power has to be flipped, not set to an explicit target), not
        // a verification read-back — it already tells us the resulting state once we know which
        // way we just sent it.
        const status = await client.getStatus();
        const nextIsOn = status.power !== "ON";
        if (nextIsOn) {
          await client.powerOn();
        } else {
          await client.powerStandby();
        }
        return { power: nextIsOn ? "on" : "off" };
      }
      case "volumeUp":
        await client.volumeUp();
        // A relative +VOLUME_STEP_DB adjustment — the receiver's own response doesn't carry the
        // resulting level, so the actual new volume can only be read back (undefined patch).
        return undefined;
      case "volumeDown":
        await client.volumeDown();
        return undefined;
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new CommandValidationError("setVolume requires a numeric 'volume' arg (the receiver's own dB scale)");
        await client.setVolume(target);
        // Exact value we just set, unlike volumeUp/volumeDown's relative step — trust it.
        return { volume: target };
      }
      case "mute": {
        // Load-bearing read (setMute takes an explicit boolean) — muting doesn't change the
        // volume level, so it's carried through from this same read rather than re-fetched.
        const status = await client.getStatus();
        const nextMuted = !status.muted;
        await client.setMute(nextMuted);
        return { volume: status.volumeDb, muted: nextMuted };
      }
      default:
        throw new CommandValidationError(`DenonDriver does not implement capability: ${command.capability}`);
    }
  }

  /** Raw, unhandled status read — no self-healing, no retry. Split out purely so
   * `fetchLiveStateWithSelfHeal` below can attempt it twice (original IP, then a rediscovered
   * one) without recursing into `refreshState`'s own disconnect/backoff bookkeeping. */
  private async fetchLiveState(device: Device): Promise<DenonStatus> {
    const client = new DenonClient(requireConfig(device));
    return client.getStatus();
  }

  /**
   * Real gap found live (2026-09-21, ADR-HEARTH-120): mirrors LgWebOsDriver.ts's/RokuEcpDriver.ts's/
   * SonyBraviaDriver.ts's identical self-healing (ADR-HEARTH-017/109/119) — a receiver that moves
   * to a different network kept retrying the same dead IP forever. On any reachability failure,
   * check whether Family Command Center currently sees this device's MAC at a different address,
   * retry once at whatever it finds. Safe to try unconditionally.
   */
  private async fetchLiveStateWithSelfHeal(device: Device): Promise<DenonStatus> {
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

  /** Re-reads power/volume/mute from the receiver and updates cached state. Never trusts a command's own result as proof of success — always reads the state back. */
  private async refreshState(device: Device): Promise<DeviceState> {
    const generation = this.generations.get(device.id) ?? 0;
    try {
      const status = await this.fetchLiveStateWithSelfHeal(device);
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
