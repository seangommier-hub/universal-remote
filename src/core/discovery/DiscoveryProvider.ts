import { DeviceCategory } from "../types/Device";

/** A device found on the network/ecosystem before the user has paired it. */
export interface DiscoveredDevice {
  id: string;
  name: string;
  category: DeviceCategory;
  manufacturer: string;
  driverId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Implemented once per discovery mechanism (mDNS, SSDP, Bluetooth LE, manufacturer cloud
 * account linking, etc). No implementations exist yet — this interface reserves the seam
 * so discovery can be added later without touching DeviceDriver or the CommandEngine.
 */
export interface DiscoveryProvider {
  id: string;
  displayName: string;
  scan(onFound: (device: DiscoveredDevice) => void, signal?: AbortSignal): Promise<void>;
}
