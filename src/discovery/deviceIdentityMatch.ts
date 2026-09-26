import { Device } from "../core/types/Device";

// ADR-HEARTH-156: "is this the same physical device?" across IP changes. Compares MAC (hwaddr),
// the device's own UUID and its serial number; only identifiers both sides actually have count.

const IDENTITY_KEYS = ["hwaddr", "uuid", "serial"] as const;
type IdentityKey = (typeof IDENTITY_KEYS)[number];

/** A device's stable identifiers, lower-cased; keys it doesn't have are absent. */
export function stableIdentities(device: Pick<Device, "config">): Partial<Record<IdentityKey, string>> {
  const found: Partial<Record<IdentityKey, string>> = {};
  for (const key of IDENTITY_KEYS) {
    const value = device.config?.[key];
    if (typeof value === "string" && value.trim()) found[key] = value.trim().toLowerCase();
  }
  return found;
}

/** True when two devices share at least one stable identifier (MAC, UUID or serial). */
export function isSamePhysicalDevice(a: Pick<Device, "config">, b: Pick<Device, "config">): boolean {
  const left = stableIdentities(a);
  const right = stableIdentities(b);
  return IDENTITY_KEYS.some((key) => left[key] !== undefined && left[key] === right[key]);
}

/** Finds an already-saved device (with a different id) that is the same physical device as `candidate`. */
export function findDuplicateDevice<T extends Pick<Device, "id" | "config">>(candidate: Pick<Device, "id" | "config">, existing: T[]): T | undefined {
  return existing.find((other) => other.id !== candidate.id && isSamePhysicalDevice(candidate, other));
}
