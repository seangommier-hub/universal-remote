import { Device } from "../types/Device";

// ADR-HEARTH-189 (phase 2): which devices a guest-role phone may show and control. Deliberately the
// same restriction *concept* kid mode already established (ADR-HEARTH-176's `devicesVisibleInMode`/
// `toggleKidAllowed`), reusing the layout store's allowed-list pattern rather than inventing a
// parallel one -- kept as its own small pair of functions (not a shared import) because a guest
// (e.g. a babysitter, a known adult) and "safe for a kid" are conceptually different lists that an
// owner sets independently, even though the mechanics are identical.

/** As a guest, only the devices an owner marked guest-allowed; otherwise everything. */
export function devicesVisibleToGuest(devices: readonly Device[], guestAllowed: readonly string[], isGuest: boolean): Device[] {
  if (!isGuest) return [...devices];
  const allowed = new Set(guestAllowed);
  return devices.filter((device) => allowed.has(device.id));
}

/** Adds the device to the guest-allowed list, or removes it when already there. */
export function toggleGuestAllowed(guestAllowed: readonly string[], deviceId: string): string[] {
  return guestAllowed.includes(deviceId) ? guestAllowed.filter((id) => id !== deviceId) : [...guestAllowed, deviceId];
}
