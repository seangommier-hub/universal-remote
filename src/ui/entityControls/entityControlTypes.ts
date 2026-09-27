import { CapabilityId } from "../../core/types/Capability";
import { DriverRegistry } from "../../core/drivers/DriverRegistry";
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
  /** Looks up this device's own driver instance (ADR-HEARTH-191); only CameraControls calls this,
   * to mount-scope its Ring camera 5-second poll (useFccCameraPoll.ts) for as long as this screen
   * is open. Every other control group ignores it. */
  driverRegistry: DriverRegistry;
}

/** True when the device declares this capability. */
export function has(device: Device, capability: CapabilityId): boolean {
  return device.capabilities.includes(capability);
}
