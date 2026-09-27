import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { GoveeStatus, getStatus, setBrightness, setColor, setPower } from "./GoveeClient";
import { hueSaturationToRgb, rgbToHueSaturation } from "./GoveeColor";
import { findCurrentIpByMac, findCurrentIpByName, findMacByIp } from "../../../discovery/familyCommandCenterDeviceLookup";
import { withBackoffJitter } from "../../shared/backoffJitter";

const LOG_SCOPE = "GoveeLightDriver";
export const GOVEE_LIGHT_DRIVER_ID = "govee-light";
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
// Govee's own documented brightness range (govee-client.ts / adr/0204) -- 0 is rejected by the Pi's
// own request schema, so a request outside this range is clamped rather than sent and rejected.
const GOVEE_MIN_BRIGHTNESS = 1;
const GOVEE_MAX_BRIGHTNESS = 100;
const GOVEE_MAX_HUE = 360;
const GOVEE_MAX_SATURATION = 100;
// Scoped to the LAN-Control-capable models only (H6xxx typically, per Govee's own LAN API docs) --
// a device that only supports Govee's cloud API (account + API key) simply has no local reply to
// read, surfaced by getStatus's own specific error message (GoveeClient.ts / adr/0204), never a
// silently-wrong "off" guess.
const GOVEE_CAPABILITIES: CapabilityId[] = ["power", "setBrightness", "setColor"];

function requireConfig(device: Device): { ipAddress: string } {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string" || ipAddress.length === 0) {
    throw new Error(`Device ${device.id} is missing Govee config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function numberArg(command: Command, key: string): number {
  const value = command.args?.[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${command.capability} requires a numeric '${key}' arg`);
  }
  return value;
}

function valuesFromStatus(status: GoveeStatus): DeviceState["values"] {
  const values: DeviceState["values"] = {};
  if (status.onOff !== undefined) values.power = status.onOff ? "on" : "off";
  if (status.brightness !== undefined) values.brightness = status.brightness;
  if (status.color) Object.assign(values, rgbToHueSaturation(status.color));
  return values;
}

/**
 * Driver for Govee smart bulbs/lights via Govee's official local LAN Control API (on/off,
 * brightness, RGB color), reached through Family Command Center's UDP proxy since Expo Go has no
 * raw socket module (see GoveeClient.ts). Scoped to models that actually support the local API and
 * have "LAN Control" turned on in the Govee Home app -- Hearth cannot enable that setting remotely,
 * so the setup copy for this brand must say so explicitly (see brandRegistry.ts's hint). A model
 * that only speaks Govee's cloud API (account + API key) is out of scope entirely: this driver
 * never falls back to the cloud, it just reports a real, specific "no local reply" error instead of
 * silently guessing state (ADR-HEARTH-185).
 */
export class GoveeLightDriver implements DeviceDriver {
  id = GOVEE_LIGHT_DRIVER_ID;
  displayName = "Govee";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return GOVEE_CAPABILITIES;
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

  private async fetchLiveStatus(device: Device): Promise<GoveeStatus> {
    const { ipAddress } = requireConfig(device);
    return getStatus(ipAddress);
  }

  // Same self-healing pattern as Kasa/LG/Samsung/Roku/Sony/Denon/Yamaha/Chromecast/Sonos/Apple TV: a
  // light that moved to a new DHCP lease should re-locate itself through Family Command Center
  // instead of failing outright forever (ADR-HEARTH-126).
  private async fetchLiveStatusWithSelfHeal(device: Device): Promise<GoveeStatus> {
    try {
      return await this.fetchLiveStatus(device);
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
      return await this.fetchLiveStatus(device);
    }
  }

  private async refreshState(device: Device): Promise<DeviceState> {
    const generation = this.generations.get(device.id) ?? 0;
    try {
      const status = await this.fetchLiveStatusWithSelfHeal(device);
      const state: DeviceState = { connection: "connected", values: valuesFromStatus(status), lastUpdated: Date.now() };
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
    const { ipAddress } = requireConfig(device);
    try {
      await this.applyCommand(ipAddress, device, command);
      // Govee's turn/brightness/colorwc commands have no acknowledgement (adr/0204) -- this
      // read-back is both the real confirmed state (same "trust the device's own readback, not the
      // request" pattern as KasaPlugDriver.ts) and this driver's one honest signal for "no local
      // reply" (LAN Control off, or a cloud-only model), surfaced by GoveeClient.getStatus's own
      // specific error message rather than a generic timeout.
      const status = await getStatus(ipAddress);
      this.setState(device.id, { connection: "connected", values: valuesFromStatus(status), lastUpdated: Date.now() });
    } catch (err) {
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
      this.scheduleReconnect(device);
      throw err;
    }
    const state = this.states.get(device.id)!;
    return { success: true, deviceId: device.id, capability: command.capability, timestamp: Date.now(), state: state.values };
  }

  private async applyCommand(ipAddress: string, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "power": {
        const current = this.states.get(device.id)?.values.power;
        await setPower(ipAddress, current !== "on");
        return;
      }
      case "setBrightness": {
        const brightness = clamp(numberArg(command, "brightness"), GOVEE_MIN_BRIGHTNESS, GOVEE_MAX_BRIGHTNESS);
        await setBrightness(ipAddress, brightness);
        return;
      }
      case "setColor": {
        const hue = clamp(numberArg(command, "hue"), 0, GOVEE_MAX_HUE);
        const saturation = clamp(numberArg(command, "saturation"), 0, GOVEE_MAX_SATURATION);
        const { r, g, b } = hueSaturationToRgb(hue, saturation);
        await setColor(ipAddress, r, g, b);
        return;
      }
      default:
        throw new Error(`GoveeLightDriver does not implement capability: ${command.capability}`);
    }
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
