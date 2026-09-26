import { DeviceDriver, StateChangeListener } from "../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../core/types/Capability";
import { Command, CommandResult } from "../../core/types/Command";
import { Device } from "../../core/types/Device";
import { DeviceState } from "../../core/types/DeviceState";
import { logger } from "../../core/logging/logger";
import { findMovedAddress, backfillHwaddr } from "./selfHeal";
import { withBackoffJitter } from "./backoffJitter";

// ADR-HEARTH-165: the shared skeleton of every driver that talks to its device one request at a
// time (no persistent socket): a per-device state map with listeners, deduped connect(), a
// generation counter so disconnect() beats an in-flight refresh, jittered reconnect backoff, and
// self-healing of a moved DHCP address through Family Command Center (ADR-HEARTH-126). Vizio, Wiz,
// LIFX and Shelly plug their protocol into readValues()/perform(); the older per-request drivers
// (Kasa, Roku) keep their own copy of this logic and are not migrated here.

const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

/** Thrown for a command the caller got wrong (bad argument); never treated as the device being unreachable. */
export class InvalidCommandError extends Error {}

/** Returns the saved address, or throws a plain-language error when the device was never given one. */
export function requireIpAddress(device: Device, brandLabel: string): string {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string" || ipAddress.length === 0) {
    throw new Error(`Device ${device.id} is missing its ${brandLabel} address (config.ipAddress) — add it again`);
  }
  return ipAddress;
}

/** Base class for request/response drivers; subclasses supply the protocol, this class supplies the connection lifecycle. */
export abstract class PerRequestDriver implements DeviceDriver {
  abstract id: string;
  abstract displayName: string;
  protected abstract readonly logScope: string;

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();

  abstract getCapabilities(): CapabilityId[];

  /** Reads the device's live values (power, brightness, ...) over the network; rejects when it cannot be reached. */
  protected abstract readValues(device: Device): Promise<DeviceState["values"]>;

  /** Carries out one already-supported command and resolves with the values the device confirmed; may throw InvalidCommandError. */
  protected abstract perform(device: Device, command: Command, current: DeviceState["values"]): Promise<DeviceState["values"]>;

  async connect(device: Device): Promise<void> {
    const existing = this.inFlightConnects.get(device.id);
    if (existing) return existing;
    this.clearReconnectTimer(device.id);
    const attempt = this.refreshState(device);
    this.inFlightConnects.set(device.id, attempt);
    try {
      await attempt;
    } finally {
      if (this.inFlightConnects.get(device.id) === attempt) this.inFlightConnects.delete(device.id);
    }
  }

  async disconnect(device: Device): Promise<void> {
    this.generations.set(device.id, this.currentGeneration(device.id) + 1);
    this.clearReconnectTimer(device.id);
    this.setState(device.id, { connection: "disconnected", values: this.states.get(device.id)?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    if (!this.getCapabilities().includes(command.capability)) {
      throw new Error(`${this.displayName} does not implement capability: ${command.capability}`);
    }
    try {
      const current = this.states.get(device.id)?.values ?? {};
      const confirmed = await this.perform(device, command, current);
      this.setState(device.id, { connection: "connected", values: { ...current, ...confirmed }, lastUpdated: Date.now() });
    } catch (err) {
      if (err instanceof InvalidCommandError) throw err;
      this.setState(device.id, { connection: "disconnected", values: this.states.get(device.id)?.values ?? {}, lastUpdated: Date.now() });
      this.scheduleReconnect(device);
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

  /** Publishes a state and tells subscribers; for subclasses that learn something outside a command. */
  protected setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }

  private currentGeneration(deviceId: string): number {
    return this.generations.get(deviceId) ?? 0;
  }

  private async readValuesWithSelfHeal(device: Device): Promise<DeviceState["values"]> {
    try {
      return await this.readValues(device);
    } catch (err) {
      const currentIp = device.config?.ipAddress;
      if (typeof currentIp !== "string") throw err;
      const freshIp = await this.lookUpMovedAddress(device, currentIp);
      if (!freshIp || freshIp === currentIp) throw err;
      logger.info(this.logScope, `${device.name} found at a new address: ${currentIp} -> ${freshIp} — retrying`);
      if (device.config) device.config.ipAddress = freshIp;
      await this.rememberMac(device, freshIp);
      return this.readValues(device);
    }
  }

  private async lookUpMovedAddress(device: Device, currentIp: string): Promise<string | null> {
    logger.warn(this.logScope, `${device.name} failed to reach ${currentIp} — checking Family Command Center for its current address`);
    const hwaddr = device.config?.hwaddr;
    return (await findMovedAddress(device)) ?? null;
  }

  private async rememberMac(device: Device, freshIp: string): Promise<void> {
    await backfillHwaddr(device, freshIp);
  }

  private async refreshState(device: Device): Promise<void> {
    const generation = this.currentGeneration(device.id);
    try {
      const values = await this.readValuesWithSelfHeal(device);
      if (generation !== this.currentGeneration(device.id)) return;
      this.clearReconnectTimer(device.id);
      this.setState(device.id, { connection: "connected", values: { ...this.states.get(device.id)?.values, ...values }, lastUpdated: Date.now() });
    } catch (err) {
      logger.warn(this.logScope, `Failed to reach ${device.name} at ${device.config?.ipAddress}`, { message: err instanceof Error ? err.message : String(err) });
      if (generation !== this.currentGeneration(device.id)) throw err;
      this.setState(device.id, { connection: "disconnected", values: this.states.get(device.id)?.values ?? {}, lastUpdated: Date.now() });
      this.scheduleReconnect(device);
      throw err;
    }
  }

  private scheduleReconnect(device: Device, attempt = 1): void {
    if (attempt === 1 && this.reconnectTimers.has(device.id)) return;
    const delay = withBackoffJitter(Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS));
    logger.warn(this.logScope, `${device.name} unreachable — retrying in ${delay / 1000}s (attempt ${attempt})`);
    const timer = setTimeout(async () => {
      try {
        await this.refreshState(device);
        logger.info(this.logScope, `${device.name} reachable again after ${attempt} attempt(s)`);
      } catch {
        this.scheduleReconnect(device, attempt + 1);
      }
    }, delay);
    this.reconnectTimers.set(device.id, timer);
  }

  private clearReconnectTimer(deviceId: string): void {
    const timer = this.reconnectTimers.get(deviceId);
    if (!timer) return;
    clearTimeout(timer);
    this.reconnectTimers.delete(deviceId);
  }
}
