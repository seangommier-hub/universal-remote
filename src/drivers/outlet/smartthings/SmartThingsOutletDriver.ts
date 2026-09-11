import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { loadSmartThingsConfig, saveSmartThingsConfig } from "../../../discovery/smartThingsConfig";
import { SmartThingsClient } from "./SmartThingsClient";

export const SMARTTHINGS_OUTLET_DRIVER_ID = "smartthings-outlet";
const OUTLET_CAPABILITIES: CapabilityId[] = ["power"];
// Refresh proactively once within 5 minutes of expiry, rather than waiting for a request to fail
// with 401 and reacting — SmartThings access tokens are typically short-lived (~24h), so a
// background reconnect or an idle app reopened after a while is exactly when this matters.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** What a fresh token exchange/refresh returns — the shape every OAuth token endpoint returns regardless of how the exchange itself happens (direct PKCE from the phone, or proxied through Family Command Center if SmartThings' registered app type turns out to need a confidential client — see ADR-HEARTH-042). */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the new accessToken expires, as returned by the token endpoint — converted to an absolute epoch-ms expiresAt for storage. */
  expiresIn: number;
}

/** Performs a refresh-token exchange, returning a fresh access token. Injected rather than hardcoded so this driver doesn't need to know or care whether the exchange happens directly against SmartThings (a public/PKCE client) or via a Family Command Center proxy endpoint (a confidential client) — that's an auth-flow decision, not a device-control one. */
export type RefreshAccessToken = (refreshToken: string) => Promise<RefreshedTokens>;

function requireOutletId(device: Device): string {
  const outletId = device.config?.deviceId;
  if (typeof outletId !== "string") {
    throw new Error(`Device ${device.id} is missing SmartThings config (config.deviceId) — pair it first`);
  }
  return outletId;
}

/**
 * Driver for one SmartThings-connected outlet/plug (ADR-HEARTH-042). Each outlet is its own
 * `Device`, `config.deviceId` holding the SmartThings device id — the OAuth tokens themselves are
 * account-wide (loaded via smartThingsConfig.ts), not per-device, unlike Hue's per-bridge
 * username.
 */
export class SmartThingsOutletDriver implements DeviceDriver {
  id = SMARTTHINGS_OUTLET_DRIVER_ID;
  displayName = "SmartThings";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  constructor(private refreshAccessToken: RefreshAccessToken) {}

  getCapabilities(): CapabilityId[] {
    return OUTLET_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const outletId = requireOutletId(device);
    try {
      const client = await this.getValidClient();
      const state = await client.getSwitchState(outletId);
      this.setState(device.id, { connection: "connected", values: { power: state }, lastUpdated: Date.now() });
    } catch (err) {
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
      throw err;
    }
  }

  async disconnect(device: Device): Promise<void> {
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
      const client = await this.getValidClient();
      const current = this.states.get(device.id)?.values.power;
      const next = current === "on" ? "off" : "on";
      await client.setSwitchState(outletId, next);
      this.setState(device.id, { connection: "connected", values: { power: next }, lastUpdated: Date.now() });
    } catch (err) {
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
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

  /** Loads the saved OAuth config, refreshing it first if it's expired or about to be — every call site gets a client backed by a token that's actually valid right now, never one left to fail with a 401 mid-command. */
  private async getValidClient(): Promise<SmartThingsClient> {
    let config = await loadSmartThingsConfig();
    if (!config) {
      throw new Error("SmartThings isn't connected yet — add it from the device list first.");
    }
    if (Date.now() >= config.expiresAt - REFRESH_MARGIN_MS) {
      const refreshed = await this.refreshAccessToken(config.refreshToken);
      config = { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: Date.now() + refreshed.expiresIn * 1000 };
      await saveSmartThingsConfig(config);
    }
    return new SmartThingsClient(config.accessToken);
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
