import { Device } from "../core/types/Device";

/** A device is shared with the household unless it was explicitly switched off, so devices saved before per-device sharing existed keep syncing. */
export function isShared(device: Device): boolean {
  return device.shared !== false;
}

/** Only these ever leave the phone, on a bump, "Share mine", or the automatic household sync. */
export function selectSharedDevices(devices: Device[]): Device[] {
  return devices.filter(isShared);
}

/** A device that arrived from another household phone is shared here too, so it keeps syncing onward. */
export function markShared(device: Device): Device {
  return { ...device, shared: true };
}
