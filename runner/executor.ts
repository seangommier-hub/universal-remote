import { CapabilityId } from "../src/core/types/Capability";
import { CommandResult } from "../src/core/types/Command";
import { Device } from "../src/core/types/Device";
import { DeviceState } from "../src/core/types/DeviceState";
import { logger } from "../src/core/logging/logger";
import { bridgeDeviceState } from "../src/runtime/stateStoreBridge";
import { HearthRuntime } from "../src/runtime/bootstrap";

const LOG_SCOPE = "RunnerExecutor";

/** Runs device commands through the real Hearth CommandEngine and drivers, connecting each device on first use. */
export class DeviceExecutor {
  private readonly connecting = new Map<string, Promise<void>>();
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly runtime: HearthRuntime, devices: Device[]) {
    for (const device of devices) {
      runtime.deviceRegistry.add(device);
      const driver = runtime.driverRegistry.get(device.driverId);
      if (driver) this.unsubscribers.push(bridgeDeviceState(driver, device, runtime.stateStore));
    }
  }

  /** Runs one capability on one device; never throws, failures come back as a CommandResult. */
  async execute(deviceId: string, capability: CapabilityId, args?: Record<string, unknown>): Promise<CommandResult> {
    const connectError = await this.connect(deviceId);
    if (connectError) {
      return { success: false, deviceId, capability, timestamp: Date.now(), error: { code: "driver_error", message: connectError } };
    }
    return this.runtime.commandEngine.execute({ deviceId, capability, args });
  }

  /** Last-known state for a device, or null when the device isn't in the runner's device list. */
  getState(deviceId: string): DeviceState | null {
    return this.runtime.deviceRegistry.get(deviceId) ? this.runtime.stateStore.get(deviceId) : null;
  }

  /** Ids and names of the devices this runner controls. */
  listDevices(): Array<{ id: string; name: string; driverId: string }> {
    return this.runtime.deviceRegistry.list().map(({ id, name, driverId }) => ({ id, name, driverId }));
  }

  /** Connects every device now so heartbeats, reconnects and state pushes run without waiting for a command. */
  async connectAll(): Promise<void> {
    const ids = this.runtime.deviceRegistry.list().map((device) => device.id);
    await Promise.all(ids.map((id) => this.connect(id)));
  }

  /** Disconnects every device and stops state listeners. */
  async shutdown(): Promise<void> {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    await Promise.all(
      this.runtime.deviceRegistry.list().map((device) => this.runtime.driverRegistry.get(device.driverId)?.disconnect(device).catch(() => undefined))
    );
  }

  /** Connects the device if needed; resolves to an error message, or null when connected (or unknown to the runner, which the engine reports itself). */
  async connect(deviceId: string): Promise<string | null> {
    const device = this.runtime.deviceRegistry.get(deviceId);
    const driver = device && this.runtime.driverRegistry.get(device.driverId);
    if (!device || !driver) return null; // CommandEngine reports device_not_found / driver_not_found itself
    if (this.runtime.stateStore.get(deviceId).connection === "connected") return null;
    try {
      const pending = this.connecting.get(deviceId) ?? driver.connect(device);
      this.connecting.set(deviceId, pending);
      await pending;
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not connect ${device.name}`, { deviceId, message });
      return message;
    } finally {
      this.connecting.delete(deviceId);
    }
  }
}
