import { CapabilityId } from "../core/types/Capability";
import { Device } from "../core/types/Device";

/** Whether a device declares the given capability — the remote screen's only per-device gate. */
export function has(device: Device, capability: CapabilityId): boolean {
  return device.capabilities.includes(capability);
}
