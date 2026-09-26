import { Device } from "../../core/types/Device";
import type { BrandId } from "../../discovery/brandRegistry";

// Self-healing (ADR-HEARTH-169) needs the household's saved devices and the driver-to-brand map,
// but drivers must not import the runtime or the brand registry (which imports every driver — a
// cycle). Bootstrap registers both once.

let savedDevices: () => Device[] = () => [];
let brandIdForDriver: (driverId: string) => BrandId | undefined = () => undefined;

/** Registers where drivers read the household's saved devices and driver brands from. */
export function setSelfHealContext(context: { savedDevices: () => Device[]; brandIdForDriver: (driverId: string) => BrandId | undefined }): void {
  savedDevices = context.savedDevices;
  brandIdForDriver = context.brandIdForDriver;
}

/** IPs of every saved device other than `device`. */
export function otherSavedDeviceIps(device: Device): string[] {
  return savedDevices()
    .filter((other) => other.id !== device.id)
    .map((other) => other.config?.ipAddress)
    .filter((ip): ip is string => typeof ip === "string");
}

/** The brand a device's driver belongs to, when registered. */
export function brandIdOf(device: Device): BrandId | undefined {
  return brandIdForDriver(device.driverId);
}
