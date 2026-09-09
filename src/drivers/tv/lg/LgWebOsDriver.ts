import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId, NavigationDirection } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { LgWebOsClient, LgWebOsConfig } from "./LgWebOsClient";

const LOG_SCOPE = "LgWebOsDriver";
export const LG_WEBOS_DRIVER_ID = "lg-webos-ws3000";

// Only "powerOff" is declared, not "power" — LG's WebSocket protocol has no documented way to
// turn a TV ON (only ssap://system/turnOff exists; waking one requires Wake-on-LAN, which is a
// separate, unimplemented mechanism). No inputSelection — switching inputs needs
// ssap://tv/getExternalInputList to learn valid inputIds first, which isn't implemented yet.
// See ADR-HEARTH-006.
const LG_CAPABILITIES: CapabilityId[] = [
  "powerOff",
  "volumeUp",
  "volumeDown",
  "setVolume",
  "mute",
  "channelUp",
  "channelDown",
  "directionalNavigation",
  "select",
  "back",
  "home",
  "menu",
];

const DIRECTION_BUTTONS: Record<NavigationDirection, string> = {
  up: "UP",
  down: "DOWN",
  left: "LEFT",
  right: "RIGHT",
};

function requireConfig(device: Device): LgWebOsConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing LG config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

/**
 * Driver for LG webOS TVs over the unencrypted community SSAP WebSocket protocol
 * (ws://<ip>:3000). Requires the TV to still accept that unencrypted port — per ADR-HEARTH-006,
 * TVs from roughly 2023 onward may only accept the encrypted wss://3001 path, which is NOT
 * supported here (same self-signed-certificate limitation as Samsung's driver).
 *
 * Volume/mute state is read back from the TV after each command (ssap://audio/getVolume) using
 * inferred field names (`volume`, `mute`) — LG's official docs for this reverse-engineered
 * protocol don't publish a payload schema, so these are best-effort and degrade to `undefined`
 * rather than crash if wrong. Power and nav/menu state are optimistic (no verified read-back).
 */
export class LgWebOsDriver implements DeviceDriver {
  id = LG_WEBOS_DRIVER_ID;
  displayName = "LG webOS TV (WebSocket, unencrypted)";

  private clients = new Map<string, LgWebOsClient>();
  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return LG_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const client = new LgWebOsClient(requireConfig(device));
    await client.connect();
    this.clients.set(device.id, client);
    // Successfully pairing over this socket means the TV is on right now.
    this.setState(device.id, { connection: "connected", values: { power: "on" }, lastUpdated: Date.now() });
    await this.refreshVolumeState(device, client);
  }

  async disconnect(device: Device): Promise<void> {
    this.clients.get(device.id)?.close();
    this.clients.delete(device.id);
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const client = this.clients.get(device.id);
    if (!client) {
      throw new Error(`Device ${device.id} is not connected — call connect() before sending commands`);
    }

    await this.applyCommand(client, device, command);

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

  private async applyCommand(client: LgWebOsClient, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "powerOff":
        await client.call("ssap://system/turnOff");
        this.patchValues(device.id, { power: "off" });
        return;
      case "volumeUp":
        await client.call("ssap://audio/volumeUp");
        await this.refreshVolumeState(device, client);
        return;
      case "volumeDown":
        await client.call("ssap://audio/volumeDown");
        await this.refreshVolumeState(device, client);
        return;
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new Error("setVolume requires a numeric 'volume' arg");
        await client.call("ssap://audio/setVolume", { volume: target });
        await this.refreshVolumeState(device, client);
        return;
      }
      case "mute": {
        const current = await client.call("ssap://audio/getVolume");
        await client.call("ssap://audio/setMute", { mute: !current.mute });
        await this.refreshVolumeState(device, client);
        return;
      }
      case "channelUp":
        await client.call("ssap://tv/channelUp");
        this.patchValues(device.id, { lastAction: "channelUp" });
        return;
      case "channelDown":
        await client.call("ssap://tv/channelDown");
        this.patchValues(device.id, { lastAction: "channelDown" });
        return;
      case "select":
        await client.sendButton("ENTER");
        this.patchValues(device.id, { lastAction: "select" });
        return;
      case "back":
        await client.sendButton("BACK");
        this.patchValues(device.id, { lastAction: "back" });
        return;
      case "home":
        await client.sendButton("HOME");
        this.patchValues(device.id, { lastAction: "home" });
        return;
      case "menu":
        await client.sendButton("MENU");
        this.patchValues(device.id, { lastAction: "menu" });
        return;
      case "directionalNavigation": {
        const direction = command.args?.direction as NavigationDirection | undefined;
        if (!direction || !(direction in DIRECTION_BUTTONS)) {
          throw new Error("directionalNavigation requires a valid 'direction' arg");
        }
        await client.sendButton(DIRECTION_BUTTONS[direction]);
        this.patchValues(device.id, { lastNavigation: direction });
        return;
      }
      default:
        throw new Error(`LgWebOsDriver does not implement capability: ${command.capability}`);
    }
  }

  private async refreshVolumeState(device: Device, client: LgWebOsClient): Promise<void> {
    try {
      const payload = await client.call("ssap://audio/getVolume");
      this.patchValues(device.id, { volume: payload.volume, muted: payload.mute });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not read back volume state for ${device.name}`, { message });
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
