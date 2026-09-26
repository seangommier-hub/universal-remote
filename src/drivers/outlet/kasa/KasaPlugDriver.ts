import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { getSysInfo, KasaSysInfo, setRelayState } from "./KasaClient";
import { findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "../../../discovery/familyCommandCenterDeviceLookup";
import { withBackoffJitter } from "../../shared/backoffJitter";

const LOG_SCOPE = "KasaPlugDriver";
export const KASA_PLUG_DRIVER_ID = "kasa-plug";
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
// TP-Link's own local protocol (see KasaClient.ts / family-command-center's kasa-client.ts) only
// ever exposes the relay on/off -- no dimming, no energy-monitor readback wired up here even on
// models (HS110/KP115) that support it, matching this codebase's own rule that a driver never
// claims a capability it can't actually perform (see Capability.ts, and XboxDriver.ts's identical
// power-on-only scope for the same reason).
const KASA_CAPABILITIES: CapabilityId[] = ["power"];

function requireConfig(device: Device): { ipAddress: string } {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string" || ipAddress.length === 0) {
    throw new Error(`Device ${device.id} is missing Kasa config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

/**
 * Driver for TP-Link Kasa smart plugs (HS100/HS103/HS105/HS110/KP115 and similar), reached
 * through Family Command Center's raw-TCP proxy (see KasaClient.ts) since Expo Go has no raw
 * socket module. Deliberately scoped to plugs running TP-Link's legacy, unauthenticated local
 * protocol only -- confirmed against python-kasa's own source (2026-09-15) that newer Kasa
 * firmware speaks a different, encrypted protocol ("KLAP") this driver cannot talk to at all. A
 * plug on that newer protocol fails with an honest, specific error (surfaced from
 * family-command-center's kasa-client.ts) rather than silently misreporting its state.
 */
export class KasaPlugDriver implements DeviceDriver {
  id = KASA_PLUG_DRIVER_ID;
  displayName = "TP-Link Kasa";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return KASA_CAPABILITIES;
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

  private async fetchLiveState(device: Device): Promise<KasaSysInfo> {
    const { ipAddress } = requireConfig(device);
    return getSysInfo(ipAddress);
  }

  // Same self-healing pattern as LG/Samsung/Roku/Sony/Denon/Yamaha/Chromecast/Sonos/Apple TV: a
  // plug that moved to a new DHCP lease should re-locate itself through Family Command Center
  // instead of failing outright forever (ADR-HEARTH-126).
  private async fetchLiveStateWithSelfHeal(device: Device): Promise<KasaSysInfo> {
    try {
      return await this.fetchLiveState(device);
    } catch (err) {
      const hwaddr = device.config?.hwaddr;
      const currentIp = device.config?.ipAddress;
      if (typeof currentIp !== "string") throw err;
      logger.warn(LOG_SCOPE, `${device.name} failed to reach ${currentIp} — checking Family Command Center for its current address`);
      const freshIp = typeof hwaddr === "string" ? await findCurrentIpByMac(hwaddr) : await findCurrentIpByName(device.name);
      if (!freshIp || freshIp === currentIp) throw err;
      logger.info(LOG_SCOPE, `${device.name} found at a new address: ${currentIp} -> ${freshIp} — retrying`);
      if (device.config) device.config.ipAddress = freshIp;
      if (typeof hwaddr !== "string" && device.config) {
        const discoveredMac = await findMacByIp(freshIp);
        if (discoveredMac) device.config.hwaddr = discoveredMac;
      }
      return await this.fetchLiveState(device);
    }
  }

  private async refreshState(device: Device): Promise<DeviceState> {
    const generation = this.generations.get(device.id) ?? 0;
    try {
      const info = await this.fetchLiveStateWithSelfHeal(device);
      // A genuinely missing relay_state (the protocol type allows it, though real hardware
      // always reports it) has nothing honest to show as "on" or "off" -- same "unknown state,
      // don't guess" rule as UniversalTvRemote.tsx's knownPower pattern, so this is left out of
      // values entirely rather than defaulting to a false claim.
      const values: DeviceState["values"] = info.model ? { model: info.model } : {};
      if (info.relayState !== undefined) values.power = info.relayState ? "on" : "off";
      // deviceName (ADR-HEARTH-085/088): `alias` is the outlet's own real name, set by the user in
      // the Kasa app — already fetched by getSysInfo() above for `model`, no extra call needed.
      // Surfaced purely as a suggestion for the add/discovery flow; never overwrites an
      // already-saved Device.name.
      if (info.alias) values.deviceName = info.alias;
      const state: DeviceState = { connection: "connected", values, lastUpdated: Date.now() };
      if (generation !== (this.generations.get(device.id) ?? 0)) return state;
      this.clearReconnectTimer(device.id);
      this.setState(device.id, state);
      return state;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Failed to reach ${device.name} at ${device.config?.ipAddress}`, { message });
      if (generation !== (this.generations.get(device.id) ?? 0)) throw err;
      const current = this.states.get(device.id);
      const state: DeviceState = { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() };
      this.setState(device.id, state);
      this.scheduleReconnect(device);
      throw err;
    }
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
    if (command.capability !== "power") {
      throw new Error(`KasaPlugDriver does not implement capability: ${command.capability}`);
    }
    const { ipAddress } = requireConfig(device);
    try {
      const current = this.states.get(device.id)?.values.power;
      const next = current === "on" ? "off" : "on";
      await setRelayState(ipAddress, next === "on");
      // Unlike SmartThingsOutletDriver's optimistic assumption, this protocol gives a real
      // readback -- re-querying after the command matches RokuEcpDriver's refreshPowerState
      // honesty pattern (never claim a state was reached without checking), and catches the plug
      // rejecting the command for a reason that isn't a network failure (e.g. a firmware bug).
      const info = await getSysInfo(ipAddress);
      const confirmedPower = info.relayState !== undefined ? (info.relayState ? "on" : "off") : next;
      this.setState(device.id, { connection: "connected", values: { power: confirmedPower }, lastUpdated: Date.now() });
    } catch (err) {
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
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

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
