import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { Ps5Client, Ps5Credentials } from "./Ps5Client";

// Real research finding (2026-09-19): PS4/PS5's DDP wake mechanism needs a real, account-derived
// credential captured once via Sony's own official PlayStation App (see Ps5Client.ts's doc
// comment for the two reference implementations this was verified against) — there is no
// PIN-on-screen pairing like LG/Samsung, and no credential-free broadcast like Xbox's SmartGlass.
// Once captured, waking is a plain UDP packet sent directly from the phone via react-native-udp
// (already a dependency, added for SSDP — ADR-HEARTH-095), no Family Command Center dependency at
// all, matching this project's "Pi is a supplement, never required" principle. Only "powerOn" is
// declared, matching XboxDriver.ts's identical scope: no way to power off, query state, or control
// media without the console's separate, full encrypted remote-control session (out of scope here).
const PS5_CAPABILITIES: CapabilityId[] = ["powerOn"];

export const PS5_DRIVER_ID = "ps5-ddp";

interface Ps5Config {
  ipAddress: string;
  credentials: Ps5Credentials;
}

function requireConfig(device: Device): Ps5Config {
  const ipAddress = device.config?.ipAddress;
  const credentials = device.config?.credentials as Ps5Credentials | undefined;
  if (typeof ipAddress !== "string" || !credentials?.userCredential) {
    throw new Error(`Device ${device.id} is missing PS5 config (config.ipAddress and config.credentials) — pair it first`);
  }
  return { ipAddress, credentials };
}

/**
 * Driver for PS4/PS5 consoles' power-on-only DDP wake mechanism (Ps5Client.ts). Like XboxDriver,
 * there's genuinely no way to know whether a console is on, off, or even present without a full
 * authenticated session, so this never claims to know power state and connect() does no network
 * probe — sending a real wake-style packet just to "test" adding the device would be an unwanted
 * side effect. The credentials are captured once via the real pairing flow
 * (Ps5Client.captureCredentials) and trusted as given thereafter.
 */
export class Ps5Driver implements DeviceDriver {
  id = PS5_DRIVER_ID;
  displayName = "PlayStation 5 (DDP wake)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return PS5_CAPABILITIES;
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
    if (command.capability !== "powerOn") {
      throw new Error(`Ps5Driver does not implement capability: ${command.capability}`);
    }
    const { ipAddress, credentials } = requireConfig(device);
    await new Ps5Client().sendWake(ipAddress, credentials);

    // No acknowledgment exists in this protocol (see class doc) — "the packet was sent" is the
    // most honest claim available, never "the console turned on."
    const state: DeviceState = { connection: "connected", values: { lastAction: "powerOn" }, lastUpdated: Date.now() };
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
