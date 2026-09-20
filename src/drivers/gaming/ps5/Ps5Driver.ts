import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { Ps5Client } from "./Ps5Client";

// Real-hardware finding (2026-09-19): the original credential-free/broadcast-capture design never
// worked against a real PS5 — confirmed by real PS5 owners that the PS5 doesn't support the old
// broadcast-discovery mechanism the PS4 did. Rebuilt on Family Command Center's own playactor-
// backed relay (see Ps5Client.ts's doc comment and that project's ps5-client.ts), which handles a
// real PSN OAuth login plus the console's own Remote Play "Link Device" PIN registration — this
// driver itself only ever needs the console's IP, since Family Command Center resolves its own
// already-registered credential by the console's MAC on every wake. Only "powerOn" is declared,
// matching XboxDriver.ts's identical scope: no way to power off, query state, or control media
// without the console's separate, full remote-control session (out of scope here).
const PS5_CAPABILITIES: CapabilityId[] = ["powerOn"];

export const PS5_DRIVER_ID = "ps5-ddp";

function requireIpAddress(device: Device): string {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing PS5 config (config.ipAddress) — pair it first`);
  }
  return ipAddress;
}

/**
 * Driver for PS5 consoles' power-on-only wake mechanism, relayed through Family Command Center
 * (Ps5Client.ts). Like XboxDriver, there's genuinely no way to know whether a console is on, off,
 * or even present without a full authenticated session, so this never claims to know power state
 * and connect() does no network probe — sending a real wake-style packet just to "test" adding
 * the device would be an unwanted side effect. Pairing (the real PSN login + console PIN flow)
 * happens once via the app's own interactive pairing screen, not through this driver directly.
 */
export class Ps5Driver implements DeviceDriver {
  id = PS5_DRIVER_ID;
  displayName = "PlayStation 5 (via Family Command Center)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return PS5_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    requireIpAddress(device); // throws if genuinely unconfigured — otherwise nothing to verify, see class doc
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
    const ipAddress = requireIpAddress(device);
    await new Ps5Client().sendWake(ipAddress);

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
