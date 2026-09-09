import { DriverRegistry } from "../drivers/DriverRegistry";
import { DeviceRegistry } from "../registry/DeviceRegistry";
import { StateStore } from "../state/StateStore";
import { Command, CommandError, CommandResult } from "../types/Command";
import { logger } from "../logging/logger";

const LOG_SCOPE = "CommandEngine";

/**
 * The only path the UI uses to control a device. Looks up the device and its driver, checks
 * the device actually declares the requested capability, delegates to the driver, and records
 * the resulting state — never assuming a command succeeded just because it was sent.
 */
export class CommandEngine {
  constructor(
    private deviceRegistry: DeviceRegistry,
    private driverRegistry: DriverRegistry,
    private stateStore: StateStore
  ) {}

  async execute(command: Command): Promise<CommandResult> {
    const device = this.deviceRegistry.get(command.deviceId);
    if (!device) {
      return this.fail(command, "device_not_found", `No device registered with id ${command.deviceId}`);
    }

    const driver = this.driverRegistry.get(device.driverId);
    if (!driver) {
      return this.fail(command, "driver_not_found", `No driver registered with id ${device.driverId}`);
    }

    if (!device.capabilities.includes(command.capability)) {
      return this.fail(command, "unsupported_capability", `${device.name} does not support ${command.capability}`);
    }

    try {
      const result = await driver.executeCommand(device, command);
      if (result.success && result.state) {
        this.stateStore.patch(device.id, result.state);
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(LOG_SCOPE, `Driver ${driver.id} threw executing ${command.capability}`, { deviceId: device.id, message });
      return this.fail(command, "driver_error", message);
    }
  }

  private fail(command: Command, code: CommandError["code"], message: string): CommandResult {
    logger.warn(LOG_SCOPE, message, { deviceId: command.deviceId, capability: command.capability });
    return {
      success: false,
      deviceId: command.deviceId,
      capability: command.capability,
      timestamp: Date.now(),
      error: { code, message },
    };
  }
}
