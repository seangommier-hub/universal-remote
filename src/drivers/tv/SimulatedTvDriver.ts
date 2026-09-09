import { CapabilityId, NavigationDirection } from "../../core/types/Capability";
import { Command, CommandResult } from "../../core/types/Command";
import { DeviceDriver, StateChangeListener } from "../../core/drivers/DeviceDriver";
import { Device } from "../../core/types/Device";
import { DeviceState } from "../../core/types/DeviceState";

// Test-double plumbing shared by mock TV drivers only. Real manufacturer drivers (Samsung
// Tizen, LG webOS, ...) will NOT share an implementation — each speaks its own protocol and
// must stay isolated per ADR-HEARTH-001/architecture. This exists purely so the two mocks
// used to prove the driver abstraction aren't full of duplicated simulation bookkeeping.

const MIN_VOLUME = 0;
const MAX_VOLUME = 100;
const VOLUME_STEP = 2;
const MIN_CHANNEL = 1;
const MAX_CHANNEL = 200;
const DEFAULT_VOLUME = 20;
const DEFAULT_CHANNEL = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function defaultValues(): DeviceState["values"] {
  return { power: "off", volume: DEFAULT_VOLUME, muted: false, input: "hdmi1", channel: DEFAULT_CHANNEL };
}

function applyCommand(values: DeviceState["values"], command: Command): DeviceState["values"] {
  const volume = typeof values.volume === "number" ? values.volume : DEFAULT_VOLUME;
  const channel = typeof values.channel === "number" ? values.channel : DEFAULT_CHANNEL;

  switch (command.capability) {
    case "power":
      return { ...values, power: values.power === "on" ? "off" : "on" };
    case "volumeUp":
      return { ...values, volume: clamp(volume + VOLUME_STEP, MIN_VOLUME, MAX_VOLUME) };
    case "volumeDown":
      return { ...values, volume: clamp(volume - VOLUME_STEP, MIN_VOLUME, MAX_VOLUME) };
    case "setVolume": {
      const target = command.args?.volume;
      if (typeof target !== "number") throw new Error("setVolume requires a numeric 'volume' arg");
      return { ...values, volume: clamp(target, MIN_VOLUME, MAX_VOLUME) };
    }
    case "mute":
      return { ...values, muted: !values.muted };
    case "channelUp":
      return { ...values, channel: clamp(channel + 1, MIN_CHANNEL, MAX_CHANNEL) };
    case "channelDown":
      return { ...values, channel: clamp(channel - 1, MIN_CHANNEL, MAX_CHANNEL) };
    case "inputSelection": {
      const input = command.args?.input;
      if (typeof input !== "string") throw new Error("inputSelection requires a string 'input' arg");
      return { ...values, input };
    }
    case "directionalNavigation": {
      const direction = command.args?.direction as NavigationDirection | undefined;
      if (!direction) throw new Error("directionalNavigation requires a 'direction' arg");
      return { ...values, lastNavigation: direction };
    }
    case "select":
    case "back":
    case "home":
    case "menu":
      return { ...values, lastAction: command.capability };
    default:
      throw new Error(`Unsupported capability: ${command.capability}`);
  }
}

export interface SimulatedTvConfig {
  id: string;
  displayName: string;
  capabilities: CapabilityId[];
  simulatedLatencyMs: number;
}

/** Builds an in-memory fake TV driver used to prove the device/capability abstraction before any real network integration exists. */
export function createSimulatedTvDriver(config: SimulatedTvConfig): DeviceDriver {
  const states = new Map<string, DeviceState>();
  const listeners = new Map<string, Set<StateChangeListener>>();

  function currentState(deviceId: string): DeviceState {
    return states.get(deviceId) ?? { connection: "unknown", values: defaultValues(), lastUpdated: Date.now() };
  }

  function notify(deviceId: string, state: DeviceState): void {
    listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }

  return {
    id: config.id,
    displayName: config.displayName,
    getCapabilities: () => config.capabilities,

    async connect(device: Device): Promise<void> {
      const state: DeviceState = { connection: "connected", values: defaultValues(), lastUpdated: Date.now() };
      states.set(device.id, state);
      notify(device.id, state);
    },

    async disconnect(device: Device): Promise<void> {
      const state: DeviceState = { ...currentState(device.id), connection: "disconnected", lastUpdated: Date.now() };
      states.set(device.id, state);
      notify(device.id, state);
    },

    async getState(device: Device): Promise<DeviceState> {
      return currentState(device.id);
    },

    async executeCommand(device: Device, command: Command): Promise<CommandResult> {
      await new Promise((resolve) => setTimeout(resolve, config.simulatedLatencyMs));
      const before = currentState(device.id);
      const values = applyCommand(before.values, command);
      const state: DeviceState = { connection: "connected", values, lastUpdated: Date.now() };
      states.set(device.id, state);
      notify(device.id, state);
      return {
        success: true,
        deviceId: device.id,
        capability: command.capability,
        timestamp: Date.now(),
        state: values,
      };
    },

    subscribeToState(device: Device, listener: StateChangeListener): () => void {
      const set = listeners.get(device.id) ?? new Set<StateChangeListener>();
      set.add(listener);
      listeners.set(device.id, set);
      return () => set.delete(listener);
    },
  };
}
