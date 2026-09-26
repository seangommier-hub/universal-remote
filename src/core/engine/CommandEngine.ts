import { DriverRegistry } from "../drivers/DriverRegistry";
import { DeviceRegistry } from "../registry/DeviceRegistry";
import { StateStore } from "../state/StateStore";
import { Command, CommandError, CommandResult } from "../types/Command";
import { Device } from "../types/Device";
import { logger } from "../logging/logger";

const LOG_SCOPE = "CommandEngine";

/** Called after every finished command whose device is known (ADR-HEARTH-170); must be fast and is never awaited. */
export type CommandOutcomeObserver = (command: Command, device: Device, result: CommandResult) => void;

export interface ExecuteOptions {
  /** True for commands the app sends on its own (wake tests, activity steps), which are not the household's own presses. */
  silent?: boolean;
}

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

  private outcomeObserver: CommandOutcomeObserver | null = null;

  /** Registers the single observer told about every finished command; replaces any earlier one. */
  setOutcomeObserver(observer: CommandOutcomeObserver | null): void {
    this.outcomeObserver = observer;
  }

  async execute(command: Command, options: ExecuteOptions = {}): Promise<CommandResult> {
    const result = await this.run(command);
    if (!options.silent) this.notifyObserver(command, result);
    return result;
  }

  private notifyObserver(command: Command, result: CommandResult): void {
    const device = this.deviceRegistry.get(command.deviceId);
    if (!this.outcomeObserver || !device) return;
    try {
      this.outcomeObserver(command, device, result);
    } catch (err) {
      logger.warn(LOG_SCOPE, "outcome observer threw", { message: err instanceof Error ? err.message : String(err) });
    }
  }

  private async run(command: Command): Promise<CommandResult> {
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
