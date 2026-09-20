import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { SquirrelFeederBusyError, SquirrelFeederClient, SquirrelFeederClientConfig } from "./SquirrelFeederClient";

export const SQUIRREL_FEEDER_DRIVER_ID = "squirrel-feeder";
// No reconnect backoff, same reasoning as HueLightDriver.ts (ADR-HEARTH-104): the feeder's API is
// stateless per-request HTTP with no persistent connection to lose — each request simply tries
// again on its own next call.
const SQUIRREL_FEEDER_CAPABILITIES: CapabilityId[] = ["dispense"];

function requireConfig(device: Device): SquirrelFeederClientConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing an ipAddress — add it first`);
  }
  return { ipAddress };
}

/** Driver for one ESP32 squirrel feeder, via its own local HTTP API (ADR-HEARTH-104). Status fields land in DeviceState.values as: feederState, detections, dispenses, lastDetection, lastDispense, cooldownActive, wifiRssi, uptime. */
export class SquirrelFeederDriver implements DeviceDriver {
  id = SQUIRREL_FEEDER_DRIVER_ID;
  displayName = "Squirrel Feeder";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return SQUIRREL_FEEDER_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const config = requireConfig(device);
    try {
      await this.readStatus(device, config);
    } catch (err) {
      this.setState(device.id, { connection: "disconnected", values: this.states.get(device.id)?.values ?? {}, lastUpdated: Date.now() });
      throw err;
    }
  }

  private async readStatus(device: Device, config: SquirrelFeederClientConfig): Promise<void> {
    const client = new SquirrelFeederClient(config);
    const status = await client.getStatus();
    this.setState(device.id, {
      connection: "connected",
      values: {
        feederState: status.feederState,
        detections: status.detections,
        dispenses: status.dispenses,
        lastDetection: status.lastDetection,
        lastDispense: status.lastDispense,
        cooldownActive: status.cooldownActive,
        wifiRssi: status.wifiRssi,
        uptime: status.uptime,
      },
      lastUpdated: Date.now(),
    });
  }

  async disconnect(device: Device): Promise<void> {
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    if (command.capability !== "dispense") {
      throw new Error(`SquirrelFeederDriver does not implement capability: ${command.capability}`);
    }
    const config = requireConfig(device);
    const client = new SquirrelFeederClient(config);
    try {
      await client.dispense();
    } catch (err) {
      if (err instanceof SquirrelFeederBusyError) {
        // Feeder busy is a normal business outcome, not a connection failure (ADR-HEARTH-104) —
        // connection state is left untouched so the UI can show "try again shortly" without the
        // rest of the screen flashing "disconnected".
        return {
          success: false,
          deviceId: device.id,
          capability: command.capability,
          timestamp: Date.now(),
          error: { code: "driver_error", message: err.message },
        };
      }
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
      throw err;
    }
    try {
      await this.readStatus(device, config);
    } catch {
      // Best-effort refresh only — the dispense request itself already succeeded.
    }
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

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
