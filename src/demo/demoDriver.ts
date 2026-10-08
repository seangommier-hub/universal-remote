import { DeviceDriver, StateChangeListener } from "../core/drivers/DeviceDriver";
import { Command, CommandResult } from "../core/types/Command";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";
import { MediaBrowseNode } from "../core/types/MediaBrowse";
import { SnapshotImage } from "../core/types/Snapshot";
import { applyEntityCommand, demoBrowseMedia } from "./demoEntityDevices";
import { demoSnapshotFor } from "./demoFccCameras";
import { DEMO_DEVICE_SCRIPTS, DEMO_LG_ID, DemoDeviceScript } from "./demoHousehold";
import { DEMO_RE_PAIR_DELAY_MS, DEMO_RE_PAIR_NEVER_ANSWERS_MS, demoRePairOutcome } from "./demoRePair";
import { markNeedsRePair } from "../core/state/needsRePair";
import { SavedPairingRejectedError } from "../drivers/shared/savedPairingRejected";

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

  // ADR-HEARTH-223: the demo LG TV refuses its saved pairing when the URL asks for it (?repair=), until a demo re-pair succeeds.
  const rePaired = new Set<string>();
  const scriptFor = (device: Device): DemoDeviceScript => {
    const script = scripts[device.id] ?? DEFAULT_SCRIPT;
    return device.id === DEMO_LG_ID && demoRePairOutcome() !== null ? { ...script, rejectedPairing: true } : script;
  };
  const publish = (deviceId: string, state: DeviceState): void => {
    states.set(deviceId, state);
    listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  };
  const demoRePair = async (device: Device): Promise<void> => {
    const outcome = demoRePairOutcome() ?? "succeeds";
    publish(device.id, { connection: "disconnected", values: markNeedsRePair({}), lastUpdated: Date.now() });
    await new Promise((resolve) => setTimeout(resolve, outcome === "waiting" ? DEMO_RE_PAIR_NEVER_ANSWERS_MS : DEMO_RE_PAIR_DELAY_MS));
    if (outcome !== "succeeds") throw new Error("Timed out waiting for pairing approval on the TV — accept the on-screen prompt and try again");
    rePaired.add(device.id);
    publish(device.id, { connection: "connected", values: { ...scriptFor(device).values }, lastUpdated: Date.now() });
  };

  return {
    id: real.id,
    displayName: real.displayName,
    hasDynamicCapabilities: real.hasDynamicCapabilities,
    getCapabilities: () => real.getCapabilities(),
    // ADR-HEARTH-182/191: forwarded only when the wrapped driver actually implements them (Home
    // Assistant, Family Command Center cameras), same optional-passthrough pattern as
    // hasDynamicCapabilities above. Real network access stays disabled either way — demoSnapshotFor
    // routes per-device so a Ring camera with no snapshotUrl still renders as a placeholder here.
    ...(real.fetchSnapshot ? { fetchSnapshot: async (device: Device): Promise<SnapshotImage> => demoSnapshotFor(device) } : {}),
    ...(real.browseMedia ? { browseMedia: async (_device: Device, mediaContentId?: string): Promise<MediaBrowseNode> => demoBrowseMedia(mediaContentId) } : {}),

    // ADR-HEARTH-223: only a driver that really offers a re-pair gets the demo twin of it.
    ...(real.rePair ? { rePair: (device: Device): Promise<void> => demoRePair(device) } : {}),

    async connect(device: Device): Promise<void> {
      const script = scriptFor(device);
      // Always yield at least a macrotask, like a real socket: publishing synchronously would be overwritten by the bridge's initial getState() seed.
      await new Promise((resolve) => setTimeout(resolve, script.connectDelayMs ?? 0));
      if (script.rejectedPairing && !rePaired.has(device.id)) {
        publish(device.id, { connection: "disconnected", values: markNeedsRePair({}), lastUpdated: Date.now() });
        throw new SavedPairingRejectedError("This TV isn't recognizing a previous pairing anymore — accept the on-screen prompt to re-approve it");
      }
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
