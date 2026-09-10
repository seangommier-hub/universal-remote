import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { HueBridgeClient, HueBridgeConfig } from "./HueBridgeClient";
import { findCurrentIpByMac } from "../../../discovery/familyCommandCenterDeviceLookup";
import { logger } from "../../../core/logging/logger";

const LOG_SCOPE = "HueLightDriver";
export const HUE_LIGHT_DRIVER_ID = "hue-light";
// No reconnect backoff like the TV drivers: Hue's API is stateless per-request HTTP with no
// persistent connection to lose, so there's nothing to reconnect — each command simply tries
// again on its own next call. connect()/disconnect() only track whether the light was reachable
// the last time it was checked.
const HUE_CAPABILITIES: CapabilityId[] = ["power", "setBrightness", "setColor"];

export interface HueLightConfig extends HueBridgeConfig {
  username: string;
  lightId: string;
}

function requireConfig(device: Device): HueLightConfig {
  const config = device.config;
  const bridgeIpAddress = config?.bridgeIpAddress;
  const username = config?.username;
  const lightId = config?.lightId;
  if (typeof bridgeIpAddress !== "string" || typeof username !== "string" || typeof lightId !== "string") {
    throw new Error(`Device ${device.id} is missing Hue config (bridgeIpAddress/username/lightId) — pair it first`);
  }
  return { bridgeIpAddress, username, lightId };
}

/**
 * Driver for one Philips Hue light, via the bridge's local v1 REST API (ADR-HEARTH-032). Each
 * light is modeled as its own `Device`; multiple lights on the same bridge share the same
 * `username` (issued once during pairing) but each carries its own `lightId`.
 */
export class HueLightDriver implements DeviceDriver {
  id = HUE_LIGHT_DRIVER_ID;
  displayName = "Philips Hue";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return HUE_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const config = requireConfig(device);
    try {
      await this.readLightState(device, config);
    } catch (err) {
      // See LgWebOsDriver.ts's identical re-discovery reasoning (ADR-HEARTH-017) — a bridge that
      // moves to a different WiFi network leaves its saved IP just as stale as a TV's would.
      // Hue's HTTP client doesn't distinguish "unreachable" from other failures the way LG/Samsung's
      // pairing-timeout errors do, but re-discovery is harmless to attempt on any failure: if the
      // bridge isn't actually at a new address, the lookup just finds nothing and the original
      // error surfaces unchanged.
      const hwaddr = device.config?.hwaddr;
      if (typeof hwaddr === "string") {
        const freshIp = await findCurrentIpByMac(hwaddr);
        if (freshIp && freshIp !== config.bridgeIpAddress) {
          logger.info(LOG_SCOPE, `${device.name} found at a new address: ${config.bridgeIpAddress} -> ${freshIp} — retrying`);
          if (device.config) device.config.bridgeIpAddress = freshIp;
          try {
            await this.readLightState(device, { ...config, bridgeIpAddress: freshIp });
            return;
          } catch (retryErr) {
            this.setState(device.id, { connection: "disconnected", values: this.states.get(device.id)?.values ?? {}, lastUpdated: Date.now() });
            throw retryErr;
          }
        }
      }
      this.setState(device.id, { connection: "disconnected", values: this.states.get(device.id)?.values ?? {}, lastUpdated: Date.now() });
      throw err;
    }
  }

  private async readLightState(device: Device, config: HueLightConfig): Promise<void> {
    const client = new HueBridgeClient(config);
    const light = await client.getLightState(config.username, config.lightId);
    this.setState(device.id, {
      connection: light.reachable ? "connected" : "disconnected",
      values: { power: light.on ? "on" : "off", brightness: light.brightness, hue: light.hue, saturation: light.saturation, name: light.name },
      lastUpdated: Date.now(),
    });
  }

  async disconnect(device: Device): Promise<void> {
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const config = requireConfig(device);
    const client = new HueBridgeClient(config);
    try {
      await this.applyCommand(client, device, config, command);
    } catch (err) {
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
      throw err;
    }
    const state = this.states.get(device.id) ?? { connection: "connected", values: {}, lastUpdated: Date.now() };
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

  private async applyCommand(client: HueBridgeClient, device: Device, config: HueLightConfig, command: Command): Promise<void> {
    switch (command.capability) {
      case "power": {
        const current = this.states.get(device.id)?.values.power;
        const next = current === "on" ? false : true;
        await client.setLightState(config.username, config.lightId, { on: next });
        this.patchValues(device.id, { power: next ? "on" : "off" });
        return;
      }
      case "setBrightness": {
        const brightness = command.args?.brightness;
        if (typeof brightness !== "number") throw new Error("setBrightness requires a numeric 'brightness' arg (0-100)");
        await client.setLightState(config.username, config.lightId, { brightness });
        this.patchValues(device.id, { brightness });
        return;
      }
      case "setColor": {
        const hue = command.args?.hue;
        const saturation = command.args?.saturation;
        if (typeof hue !== "number" || typeof saturation !== "number") {
          throw new Error("setColor requires numeric 'hue' (0-360) and 'saturation' (0-100) args");
        }
        await client.setLightState(config.username, config.lightId, { hue, saturation });
        this.patchValues(device.id, { hue, saturation });
        return;
      }
      default:
        throw new Error(`HueLightDriver does not implement capability: ${command.capability}`);
    }
  }

  private patchValues(deviceId: string, patch: DeviceState["values"]): void {
    const current = this.states.get(deviceId);
    this.setState(deviceId, {
      connection: "connected",
      values: { ...current?.values, ...patch },
      lastUpdated: Date.now(),
    });
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
