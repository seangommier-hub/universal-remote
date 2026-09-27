import { CapabilityId } from "../../core/types/Capability";
import { Device } from "../../core/types/Device";
import { DeviceState } from "../../core/types/DeviceState";
import { SnapshotResult } from "../../core/types/Snapshot";

/** What every control group on the entity screen receives: the device, its live state, and how to press something. */
export interface EntityControlProps {
  device: Device;
  state: DeviceState;
  /** True while the device is not connected, so presses would go nowhere. */
  disabled: boolean;
  onPress: (capability: CapabilityId, args?: Record<string, unknown>) => void;
  /** Fetches a fresh snapshot image (ADR-HEARTH-182); only CameraControls calls this. */
  fetchSnapshot: (deviceId: string) => Promise<SnapshotResult>;
}

/** True when the device declares this capability. */
export function has(device: Device, capability: CapabilityId): boolean {
  return device.capabilities.includes(capability);
}
