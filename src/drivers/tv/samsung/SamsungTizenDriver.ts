import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId, NavigationDirection } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { SamsungTizenClient, SamsungTizenConfig } from "./SamsungTizenClient";

export const SAMSUNG_TIZEN_DRIVER_ID = "samsung-tizen-ws8001";

// Unlike SonyBraviaDriver, this protocol is key-press emulation only — there is no documented
// query method to read back real power/volume/state from the TV. State here is therefore
// OPTIMISTIC (assumed from the command just sent), not verified. UI code must not treat
// Samsung state with the same confidence as Sony's. inputSelection is intentionally excluded:
// the protocol only has a generic "open source menu" key (KEY_SOURCE), not a way to jump to a
// specific input (see ADR-HEARTH-005).
const SAMSUNG_CAPABILITIES: CapabilityId[] = [
  "power",
  "volumeUp",
  "volumeDown",
  "mute",
  "channelUp",
  "channelDown",
  "directionalNavigation",
  "select",
  "back",
  "home",
  "menu",
];

const DIRECTION_KEYS: Record<NavigationDirection, string> = {
  up: "KEY_UP",
  down: "KEY_DOWN",
  left: "KEY_LEFT",
  right: "KEY_RIGHT",
};

function requireConfig(device: Device): SamsungTizenConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Samsung config (config.ipAddress) — pair it first`);
  }
  return { ipAddress, appName: "Hearth" };
}

function keyCodeFor(command: Command): string {
  switch (command.capability) {
    case "power":
      return "KEY_POWER";
    case "volumeUp":
      return "KEY_VOLUP";
    case "volumeDown":
      return "KEY_VOLDOWN";
    case "mute":
      return "KEY_MUTE";
    case "channelUp":
      return "KEY_CHUP";
    case "channelDown":
      return "KEY_CHDOWN";
    case "select":
      return "KEY_ENTER";
    case "back":
      return "KEY_RETURN";
    case "home":
      return "KEY_HOME";
    case "menu":
      return "KEY_MENU";
    case "directionalNavigation": {
      const direction = command.args?.direction as NavigationDirection | undefined;
      if (!direction || !(direction in DIRECTION_KEYS)) {
        throw new Error("directionalNavigation requires a valid 'direction' arg");
      }
      return DIRECTION_KEYS[direction];
    }
    default:
      throw new Error(`SamsungTizenDriver does not implement capability: ${command.capability}`);
  }
}

function optimisticValuesAfter(command: Command, current: DeviceState["values"]): DeviceState["values"] {
  if (command.capability === "power") {
    return { ...current, power: current.power === "on" ? "off" : "on" };
  }
  if (command.capability === "mute") {
    return { ...current, muted: !current.muted };
  }
  return { ...current, lastAction: command.capability };
}

/**
 * Driver for Samsung Tizen TVs over the unencrypted community remote-control WebSocket
 * protocol. Requires the TV to accept ws://<ip>:8001 (see ADR-HEARTH-005) — not guaranteed on
 * newer firmware that may only accept the encrypted wss://8002 path.
 */
export class SamsungTizenDriver implements DeviceDriver {
  id = SAMSUNG_TIZEN_DRIVER_ID;
  displayName = "Samsung Tizen TV (WebSocket, unencrypted)";

  private clients = new Map<string, SamsungTizenClient>();
  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return SAMSUNG_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const client = new SamsungTizenClient(requireConfig(device));
    await client.connect();
    this.clients.set(device.id, client);
    this.setState(device.id, { connection: "connected", values: {}, lastUpdated: Date.now() });
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
    const current = this.states.get(device.id)?.values ?? {};
    const keyCode = keyCodeFor(command);
    client.sendKey(keyCode);

    const values = optimisticValuesAfter(command, current);
    const state: DeviceState = { connection: "connected", values, lastUpdated: Date.now() };
    this.setState(device.id, state);

    return {
      success: true,
      deviceId: device.id,
      capability: command.capability,
      timestamp: Date.now(),
      state: values,
    };
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
