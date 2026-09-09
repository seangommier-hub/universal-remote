import { CapabilityId } from "./Capability";
import { DeviceState } from "./DeviceState";

/** A request to invoke one capability on one device. */
export interface Command {
  deviceId: string;
  capability: CapabilityId;
  args?: Record<string, unknown>;
}

export interface CommandError {
  code: "device_not_found" | "driver_not_found" | "unsupported_capability" | "driver_error";
  message: string;
}

/** The outcome of dispatching a Command through the CommandEngine. Never throws — callers check `success`. */
export interface CommandResult {
  success: boolean;
  deviceId: string;
  capability: CapabilityId;
  timestamp: number;
  error?: CommandError;
  /** Partial state the driver reported as a result of this command, if any. */
  state?: Partial<DeviceState["values"]>;
}
