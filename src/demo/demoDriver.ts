import { DeviceDriver, StateChangeListener } from "../core/drivers/DeviceDriver";
import { Command, CommandResult } from "../core/types/Command";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { applyEntityCommand } from "./demoEntityDevices";
import { DEMO_DEVICE_SCRIPTS, DemoDeviceScript } from "./demoHousehold";

const VOLUME_STEP = 2;
const MAX_VOLUME = 100;

const PAIRING_WAIT_MS = 120000;
// A device that is not part of the fixed household is one being paired right now: connect waits for a TV approval that never comes.
const DEFAULT_SCRIPT: DemoDeviceScript = { reachable: true, values: {}, connectDelayMs: PAIRING_WAIT_MS };

function applyCommand(values: Record<string, unknown>, command: Command): Record<string, unknown> {
  const volume = typeof values.volume === "number" ? values.volume : 0;
  switch (command.capability) {
    case "power":
      return { ...values, power: values.power === "on" ? "off" : "on" };
    case "powerOn":
      return { ...values, power: "on" };
    case "powerOff":
      return { ...values, power: "off" };
    case "volumeUp":
      return { ...values, volume: Math.min(MAX_VOLUME, volume + VOLUME_STEP) };
    case "volumeDown":
      return { ...values, volume: Math.max(0, volume - VOLUME_STEP) };
    case "mute":
      return { ...values, muted: values.muted !== true };
    case "inputSelection":
      return { ...values, input: command.args?.input ?? values.input };
    default:
      return applyEntityCommand(values, command) ?? values;
  }
}

/** Wraps a real driver so it keeps its id and capabilities but talks to nothing: state comes from the demo script and commands only change in-memory values. */
export function createDemoDriver(real: DeviceDriver, scripts: Record<string, DemoDeviceScript> = DEMO_DEVICE_SCRIPTS): DeviceDriver {
  const states = new Map<string, DeviceState>();
  const listeners = new Map<string, Set<StateChangeListener>>();

  const scriptFor = (device: Device): DemoDeviceScript => scripts[device.id] ?? DEFAULT_SCRIPT;
  const publish = (deviceId: string, state: DeviceState): void => {
    states.set(deviceId, state);
    listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  };

  return {
    id: real.id,
    displayName: real.displayName,
    hasDynamicCapabilities: real.hasDynamicCapabilities,
    getCapabilities: () => real.getCapabilities(),

    async connect(device: Device): Promise<void> {
      const script = scriptFor(device);
      // Always yield at least a macrotask, like a real socket: publishing synchronously would be overwritten by the bridge's initial getState() seed.
      await new Promise((resolve) => setTimeout(resolve, script.connectDelayMs ?? 0));
      if (!script.reachable) {
        publish(device.id, { connection: "disconnected", values: {}, lastUpdated: Date.now() });
        throw new Error("Demo device is offline");
      }
      publish(device.id, { connection: script.connection ?? "connected", values: { ...script.values }, lastUpdated: Date.now() });
    },

    async disconnect(device: Device): Promise<void> {
      publish(device.id, { connection: "disconnected", values: states.get(device.id)?.values ?? {}, lastUpdated: Date.now() });
    },

    async getState(device: Device): Promise<DeviceState> {
      return states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
    },

    async executeCommand(device: Device, command: Command): Promise<CommandResult> {
      const values = applyCommand(states.get(device.id)?.values ?? {}, command);
      publish(device.id, { connection: "connected", values, lastUpdated: Date.now() });
      return { success: true, deviceId: device.id, capability: command.capability, timestamp: Date.now(), state: values };
    },

    subscribeToState(device: Device, listener: StateChangeListener): () => void {
      const set = listeners.get(device.id) ?? new Set<StateChangeListener>();
      set.add(listener);
      listeners.set(device.id, set);
      return () => set.delete(listener);
    },
  };
}
