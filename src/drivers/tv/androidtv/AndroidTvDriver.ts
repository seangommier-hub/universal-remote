import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId, NavigationDirection, StreamingService } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { sendWakeOnLan } from "../../../core/network/wakeOnLan";
import { findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "../../../discovery/familyCommandCenterDeviceLookup";
import { withBackoffJitter } from "../../shared/backoffJitter";
import { WAKING_VALUE_KEY, WakeBurstController, withWaking } from "../../shared/wakeBurst";
import { AndroidTvClient, AndroidTvRelayError, AndroidTvStatus } from "./AndroidTvClient";
import { ANDROID_TV_CAPABILITIES, DIRECTION_KEYS, POWER_KEY, SIMPLE_CAPABILITY_KEYS } from "./androidTvKeys";

const LOG_SCOPE = "AndroidTvDriver";
export const ANDROID_TV_DRIVER_ID = "androidtv-remote-v2";
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
/** DeviceState.values key set while the TV must be paired again; no retry can fix it. */
export const PAIRING_REQUIRED_VALUE_KEY = "pairingRequired";

const SERVICE_NAMES: Record<StreamingService, string> = {
  netflix: "netflix",
  hulu: "hulu",
  primeVideo: "primeVideo",
  youtube: "youtube",
};

interface AndroidTvConfig {
  ipAddress: string;
}

function requireConfig(device: Device): AndroidTvConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Android TV config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

function isNotPaired(err: unknown): boolean {
  return err instanceof AndroidTvRelayError && err.kind === "not_paired";
}

function valuesFromStatus(status: AndroidTvStatus): DeviceState["values"] {
  const power = status.isOn === null ? undefined : status.isOn ? "on" : "off";
  return { power, currentApp: status.currentApp ?? undefined, [PAIRING_REQUIRED_VALUE_KEY]: false };
}

/**
 * Driver for Google TV / Android TV (Chromecast with Google TV, Nvidia Shield, Sony/TCL/Hisense
 * Google TVs, Fire TV models that run the service) over the Android TV Remote v2 protocol,
 * relayed through Family Command Center's python bridge (AndroidTvClient.ts, ADR-HEARTH-168).
 * Every call is a short-lived connection on the Pi, so connect()/executeCommand always re-read
 * real state instead of assuming. A TV that is fully off refuses the connection; power then falls
 * back to Wake-on-LAN, exactly like the LG and Samsung drivers.
 */
export class AndroidTvDriver implements DeviceDriver {
  id = ANDROID_TV_DRIVER_ID;
  displayName = "Android TV / Google TV (via Family Command Center)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();
  private wakeBursts = new WakeBurstController((deviceId, active) => this.setState(deviceId, withWaking(this.states.get(deviceId), active)));

  getCapabilities(): CapabilityId[] {
    return ANDROID_TV_CAPABILITIES;
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
    await this.refreshState(device, true);
  }

  private async fetchStatus(device: Device): Promise<AndroidTvStatus> {
    const { ipAddress } = requireConfig(device);
    return new AndroidTvClient().getStatus(ipAddress);
  }

  /** Reads status, and on a reachability failure looks up the TV's current address by MAC/name and retries once (ADR-HEARTH-017/126 self-heal). */
  private async fetchStatusWithSelfHeal(device: Device): Promise<AndroidTvStatus> {
    try {
      return await this.fetchStatus(device);
    } catch (err) {
      const currentIp = device.config?.ipAddress;
      if (isNotPaired(err) || typeof currentIp !== "string") throw err;
      const hwaddr = device.config?.hwaddr;
      logger.warn(LOG_SCOPE, `${device.name} failed to reach ${currentIp} — checking Family Command Center for its current address`);
      const freshIp = typeof hwaddr === "string" ? await findCurrentIpByMac(hwaddr) : await findCurrentIpByName(device.name);
      if (!freshIp || freshIp === currentIp) throw err;
      logger.info(LOG_SCOPE, `${device.name} found at a new address: ${currentIp} -> ${freshIp} — retrying`);
      if (device.config) device.config.ipAddress = freshIp;
      if (typeof hwaddr !== "string" && device.config) {
        const discoveredMac = await findMacByIp(freshIp);
        if (discoveredMac) device.config.hwaddr = discoveredMac;
      }
      return await this.fetchStatus(device);
    }
  }

  /** Re-reads real state and caches it; on failure marks the device disconnected and (when `retry`) starts the backoff loop. */
  private async refreshState(device: Device, retry: boolean): Promise<DeviceState> {
    const generation = this.generations.get(device.id) ?? 0;
    try {
      const status = await this.fetchStatusWithSelfHeal(device);
      const state: DeviceState = { connection: "connected", values: { ...this.states.get(device.id)?.values, ...valuesFromStatus(status) }, lastUpdated: Date.now() };
      if (generation !== (this.generations.get(device.id) ?? 0)) return state;
      this.clearReconnectTimer(device.id);
      this.setState(device.id, state);
      return state;
    } catch (err) {
      if (generation !== (this.generations.get(device.id) ?? 0)) throw err;
      this.markFailed(device, err, retry);
      throw err;
    }
  }

  private markFailed(device: Device, err: unknown, retry: boolean): void {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(LOG_SCOPE, `Failed to reach ${device.name} at ${device.config?.ipAddress}`, { message });
    const values = { ...this.states.get(device.id)?.values, [PAIRING_REQUIRED_VALUE_KEY]: isNotPaired(err) };
    this.setState(device.id, { connection: "disconnected", values, lastUpdated: Date.now() });
    if (retry && !isNotPaired(err)) this.scheduleReconnect(device);
  }

  private scheduleReconnect(device: Device, attempt = 1): void {
    if (this.wakeBursts.isActive(device.id) || (attempt === 1 && this.reconnectTimers.has(device.id))) return;
    const delay = withBackoffJitter(Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS));
    logger.warn(LOG_SCOPE, `${device.name} unreachable — retrying in ${delay / 1000}s (attempt ${attempt})`);
    const timer = setTimeout(async () => {
      try {
        await this.refreshState(device, false);
        logger.info(LOG_SCOPE, `${device.name} reachable again after ${attempt} attempt(s)`);
      } catch (err) {
        if (!isNotPaired(err)) this.scheduleReconnect(device, attempt + 1);
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
    this.wakeBursts.stop(device.id);
    this.clearReconnectTimer(device.id);
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const { ipAddress } = requireConfig(device);
    let values: DeviceState["values"];
    try {
      values = await this.applyCommand(device, new AndroidTvClient(), ipAddress, command);
    } catch (err) {
      this.markFailed(device, err, true);
      throw err;
    }
    const waking = this.wakeBursts.isActive(device.id);
    const state: DeviceState = { connection: waking ? (this.states.get(device.id)?.connection ?? "disconnected") : "connected", values, lastUpdated: Date.now() };
    this.setState(device.id, state);
    return { success: true, deviceId: device.id, capability: command.capability, timestamp: Date.now(), state: state.values };
  }

  private async applyCommand(device: Device, client: AndroidTvClient, ipAddress: string, command: Command): Promise<DeviceState["values"]> {
    const current = this.states.get(device.id)?.values ?? {};
    if (command.capability === "power") return this.togglePower(device, client, ipAddress, current);
    if (command.capability === "directionalNavigation") return this.navigate(client, ipAddress, command, current);
    if (command.capability === "launchApp") return this.launchApp(client, ipAddress, command, current);
    if (command.capability === "textEntry") return this.enterText(client, ipAddress, command, current);
    const key = SIMPLE_CAPABILITY_KEYS[command.capability];
    if (!key) throw new Error(`AndroidTvDriver does not implement capability: ${command.capability}`);
    await client.sendKey(ipAddress, key);
    return { ...current, lastAction: command.capability };
  }

  private async navigate(client: AndroidTvClient, ipAddress: string, command: Command, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    const direction = command.args?.direction as NavigationDirection | undefined;
    if (!direction || !(direction in DIRECTION_KEYS)) throw new Error("directionalNavigation requires a valid 'direction' arg");
    await client.sendKey(ipAddress, DIRECTION_KEYS[direction]);
    return { ...current, lastNavigation: direction };
  }

  private async launchApp(client: AndroidTvClient, ipAddress: string, command: Command, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    const service = command.args?.service as StreamingService | undefined;
    const appId = command.args?.appId as string | undefined;
    if (appId) await client.launchApp(ipAddress, { appId });
    else if (service && service in SERVICE_NAMES) await client.launchApp(ipAddress, { service: SERVICE_NAMES[service] });
    else throw new Error(`launchApp requires a supported 'service' or 'appId' arg (got service=${String(service)}, appId=${String(appId)})`);
    return { ...current, lastAction: `launch:${appId ?? service}` };
  }

  private async enterText(client: AndroidTvClient, ipAddress: string, command: Command, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    const text = command.args?.text;
    if (typeof text !== "string" || text.length === 0) throw new Error("textEntry requires a non-empty string 'text' arg");
    await client.sendText(ipAddress, text);
    return { ...current, lastAction: "textEntry" };
  }

  /** Reads real power state and sends the one POWER key only when it changes it; an unreachable TV is woken with Wake-on-LAN instead. */
  private async togglePower(device: Device, client: AndroidTvClient, ipAddress: string, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    let status: AndroidTvStatus;
    try {
      status = await client.getStatus(ipAddress);
    } catch (err) {
      if (isNotPaired(err)) throw err;
      return this.wakeFromOff(device, current);
    }
    await client.sendKey(ipAddress, POWER_KEY);
    return { ...current, power: status.isOn === true ? "off" : "on", lastAction: "power" };
  }

  /** Resolves the TV's MAC (saved at pairing, else looked up by IP), broadcasts Wake-on-LAN, then retries connecting on the fast burst cadence. */
  private async wakeFromOff(device: Device, current: DeviceState["values"]): Promise<DeviceState["values"]> {
    const hwaddr = device.config?.hwaddr;
    const ipAddress = device.config?.ipAddress;
    const mac = typeof hwaddr === "string" ? hwaddr : typeof ipAddress === "string" ? await findMacByIp(ipAddress) : undefined;
    if (!mac) throw new Error(`Cannot power on ${device.name} — no known MAC address for Wake-on-LAN yet (it needs to have been seen on the network at least once)`);
    if (device.config && typeof hwaddr !== "string") device.config.hwaddr = mac;
    await sendWakeOnLan(mac);
    this.clearReconnectTimer(device.id);
    this.wakeBursts.start(device.id, async () => void (await this.refreshState(device, false)), () => this.scheduleReconnect(device));
    return { ...current, lastAction: "power", [WAKING_VALUE_KEY]: true };
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
