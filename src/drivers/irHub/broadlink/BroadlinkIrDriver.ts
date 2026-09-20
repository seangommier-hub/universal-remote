import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { BroadlinkClient } from "./BroadlinkClient";

export const BROADLINK_IR_DRIVER_ID = "broadlink-ir-hub";

// Real gap this closes (survey research, 2026-09-20): every other driver in this project talks a
// documented (or at least reverse-engineered-but-fixed) per-brand protocol, so its capability list
// is the same for every device instance. A Broadlink hub controls arbitrary *dumb* IR/RF hardware
// (an old window AC, a legacy TV/soundbar, a box fan) that has no protocol at all — the only thing
// this driver can ever know about a given button is whatever code the household actually taught it
// by pointing the real remote at the hub. So, uniquely among this project's drivers, capabilities
// are not a fixed const array: getCapabilities() (the "what CAN this driver ever support" list, per
// DeviceDriver's own doc comment) returns every capability this driver knows how to teach, while a
// specific Device's own `capabilities` field — the interface's documented "may support a subset" —
// is genuinely, visibly sparse: only the ones actually taught, learned via TeachBroadlinkCommandScreen.tsx
// and stored as `device.config.codes[capability]`.
//
// Scoped to no-argument, single-press capabilities only for this first version — a learned IR code
// is a fixed, opaque blob with no parameters, so anything that takes a runtime argument
// (directionalNavigation's direction, setChannel's digit, setVolume's level, inputSelection's
// target) doesn't fit this model and isn't offered here. A household still gets power, volume,
// channel, and basic transport control taught this way — the capabilities most useful for the
// "old dumb TV/AC/soundbar" hardware this driver exists for.
export const BROADLINK_TEACHABLE_CAPABILITIES: CapabilityId[] = [
  "power",
  "powerOn",
  "powerOff",
  "volumeUp",
  "volumeDown",
  "mute",
  "channelUp",
  "channelDown",
  "playPause",
  "select",
  "back",
  "home",
  "menu",
];

interface BroadlinkIrConfig {
  ipAddress: string;
  codes?: Partial<Record<CapabilityId, string>>;
}

function requireConfig(device: Device): BroadlinkIrConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Broadlink config (config.ipAddress) — pair it first`);
  }
  const codes = device.config?.codes as Partial<Record<CapabilityId, string>> | undefined;
  return { ipAddress, codes };
}

/**
 * Driver for Broadlink RM-series IR/RF hubs, relayed through Family Command Center
 * (BroadlinkClient.ts). Unlike every other driver here, this one doesn't control a single
 * documented product — it replays codes the household taught it for whatever dumb hardware they
 * point their existing remote at. No pairing/auth step exists at all (see BroadlinkClient.ts's own
 * doc comment): the hub only ever needs an IP address, so connect() does no network probe, mirroring
 * XboxDriver/Ps5Driver's identical "nothing to verify without a real side effect" reasoning.
 */
export class BroadlinkIrDriver implements DeviceDriver {
  id = BROADLINK_IR_DRIVER_ID;
  displayName = "Broadlink IR/RF Hub";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return BROADLINK_TEACHABLE_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    requireConfig(device); // throws if genuinely unconfigured — otherwise nothing to verify, see class doc
    this.setState(device.id, { connection: "connected", values: {}, lastUpdated: Date.now() });
  }

  async disconnect(device: Device): Promise<void> {
    this.setState(device.id, { connection: "disconnected", values: {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const { ipAddress, codes } = requireConfig(device);
    const code = codes?.[command.capability];
    if (typeof code !== "string") {
      throw new Error(`${device.name} hasn't learned a code for ${command.capability} yet — teach it from the device's menu first`);
    }
    await new BroadlinkClient().sendCode(ipAddress, code);

    const state: DeviceState = { connection: "connected", values: { lastAction: command.capability }, lastUpdated: Date.now() };
    this.setState(device.id, state);
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

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
