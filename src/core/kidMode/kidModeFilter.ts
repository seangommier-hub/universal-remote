import { Device } from "../types/Device";

// ADR-HEARTH-176: which devices a phone in kid mode may show and control.

/** In kid mode only the devices the adult marked allowed; otherwise everything. */
export function devicesVisibleInMode(devices: readonly Device[], kidAllowed: readonly string[], kidModeActive: boolean): Device[] {
  if (!kidModeActive) return [...devices];
  const allowed = new Set(kidAllowed);
  return devices.filter((device) => allowed.has(device.id));
}

/** Adds the device to the kid-allowed list, or removes it when already there. */
export function toggleKidAllowed(kidAllowed: readonly string[], deviceId: string): string[] {
  return kidAllowed.includes(deviceId) ? kidAllowed.filter((id) => id !== deviceId) : [...kidAllowed, deviceId];
}
