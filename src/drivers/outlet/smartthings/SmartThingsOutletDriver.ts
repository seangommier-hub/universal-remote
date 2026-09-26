import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { withBackoffJitter } from "../../shared/backoffJitter";
import { dedupeInFlight } from "../../shared/inFlightDedupe";
import { listOutlets, setOutletState } from "./SmartThingsClient";

const LOG_SCOPE = "SmartThingsOutletDriver";
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

export const SMARTTHINGS_OUTLET_DRIVER_ID = "smartthings-outlet";
const OUTLET_CAPABILITIES: CapabilityId[] = ["power"];

function requireOutletId(device: Device): string {
  const outletId = device.config?.deviceId;
  if (typeof outletId !== "string") {
    throw new Error(`Device ${device.id} is missing SmartThings config (config.deviceId) — pair it first`);
  }
  return outletId;
}

/**
 * Driver for one SmartThings-connected outlet/plug (ADR-HEARTH-042, course-corrected
 * 2026-09-11). Each outlet is its own `Device`, `config.deviceId` holding the SmartThings device
 * id — everything else (which household this is, which tokens are valid) lives entirely on the
 * Family Command Center side, reached through `SmartThingsClient.ts`'s FCC proxy calls. Unlike
 * every earlier version of this file, there is no OAuth token to load, refresh, or store here at
 * all — that entire concern doesn't exist for a WEBHOOK_SMART_APP.
 */
export class SmartThingsOutletDriver implements DeviceDriver {
  id = SMARTTHINGS_OUTLET_DRIVER_ID;
  displayName = "SmartThings";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return OUTLET_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    return dedupeInFlight(this.inFlightConnects, device.id, () => this.doConnect(device));
  }

  private async doConnect(device: Device): Promise<void> {
    const outletId = requireOutletId(device);
    const generation = this.generations.get(device.id) ?? 0;
    this.clearReconnectTimer(device.id);
    try {
      const outlets = await listOutlets();
      const outlet = outlets.find((o) => o.id === outletId);
      if (!outlet) {
        throw new Error(`Outlet ${outletId} isn't in Family Command Center's current SmartThings device list`);
      }
      // A genuinely "unknown" switch value from SmartThings is rare (a device mid-pairing or
      // offline) — fail safe to "off" rather than surface a third power state the rest of the
      // app's power-toggle UI was never built to render.
      const power = outlet.state === "unknown" ? "off" : outlet.state;
      if (generation !== (this.generations.get(device.id) ?? 0)) return; // disconnected while this was in flight
      this.setState(device.id, { connection: "connected", values: { power }, lastUpdated: Date.now() });
    } catch (err) {
      if (generation !== (this.generations.get(device.id) ?? 0)) throw err; // its own disconnect() already set the right state
      this.markDisconnectedAndRetry(device);
      throw err;
    }
  }

  /** Marks the outlet disconnected and starts the backoff reconnect loop (connection contract, ADR-HEARTH-171). */
  private markDisconnectedAndRetry(device: Device): void {
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
    this.scheduleReconnect(device);
  }

  private scheduleReconnect(device: Device, attempt = 1): void {
    if (attempt === 1 && this.reconnectTimers.has(device.id)) return;
    const delay = withBackoffJitter(Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS));
    logger.warn(LOG_SCOPE, `${device.name} unreachable — retrying in ${delay / 1000}s (attempt ${attempt})`);
    const timer = setTimeout(async () => {
      try {
        await this.connect(device);
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
    const outletId = requireOutletId(device);
    if (command.capability !== "power") {
      throw new Error(`SmartThingsOutletDriver does not implement capability: ${command.capability}`);
    }
    try {
      const current = this.states.get(device.id)?.values.power;
      const next = current === "on" ? "off" : "on";
      await setOutletState(outletId, next);
      this.setState(device.id, { connection: "connected", values: { power: next }, lastUpdated: Date.now() });
    } catch (err) {
      this.markDisconnectedAndRetry(device);
      throw err;
    }
    const state = this.states.get(device.id)!;
    return { success: true, deviceId: device.id, capability: command.capability, timestamp: Date.now(), state: state.values };
  }

  subscribeToState(device: Device, listener: StateChangeListener): () => void {
    const set = this.listeners.get(device.id) ?? new Set<StateChangeListener>();
    set.add(listener);
    this.listeners.set(device.id, set);
    return () => set.delete(listener);
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
