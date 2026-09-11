import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { listOutlets, setOutletState } from "./SmartThingsClient";

export const SMARTTHINGS_OUTLET_DRIVER_ID = "smartthings-outlet";
const OUTLET_CAPABILITIES: CapabilityId[] = ["power"];

function requireOutletId(device: Device): string {
  const outletId = device.config?.deviceId;
  if (typeof outletId !== "string") {
    throw new Error(`Device ${device.id} is missing SmartThings config (config.deviceId) — pair it first`);
  }
  return outletId;
}

/**
 * Driver for one SmartThings-connected outlet/plug (ADR-HEARTH-042, course-corrected
 * 2026-09-11). Each outlet is its own `Device`, `config.deviceId` holding the SmartThings device
 * id — everything else (which household this is, which tokens are valid) lives entirely on the
 * Family Command Center side, reached through `SmartThingsClient.ts`'s FCC proxy calls. Unlike
 * every earlier version of this file, there is no OAuth token to load, refresh, or store here at
 * all — that entire concern doesn't exist for a WEBHOOK_SMART_APP.
 */
export class SmartThingsOutletDriver implements DeviceDriver {
  id = SMARTTHINGS_OUTLET_DRIVER_ID;
  displayName = "SmartThings";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return OUTLET_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const outletId = requireOutletId(device);
    try {
      const outlets = await listOutlets();
      const outlet = outlets.find((o) => o.id === outletId);
      if (!outlet) {
        throw new Error(`Outlet ${outletId} isn't in Family Command Center's current SmartThings device list`);
      }
      // A genuinely "unknown" switch value from SmartThings is rare (a device mid-pairing or
      // offline) — fail safe to "off" rather than surface a third power state the rest of the
      // app's power-toggle UI was never built to render.
      const power = outlet.state === "unknown" ? "off" : outlet.state;
      this.setState(device.id, { connection: "connected", values: { power }, lastUpdated: Date.now() });
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
      const current = this.states.get(device.id)?.values.power;
      const next = current === "on" ? "off" : "on";
      await setOutletState(outletId, next);
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

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
