import { suggestRoom } from "../core/layout/suggestRoom";
import { Device } from "../core/types/Device";

/**
 * ADR-HEARTH-224: the rooms to pre-select on the "Add all ready" summary card -- each device's own
 * name decides ("Living Room TV" -> Living Room), exactly as the single-device post-add screen does
 * (ADR-HEARTH-221). Devices whose names mention no room are simply left out.
 */
export function planInitialRooms(devices: readonly Device[], choices: readonly string[]): Record<string, string> {
  const rooms: Record<string, string> = {};
  for (const device of devices) {
    const room = suggestRoom(device.name, choices);
    if (room) rooms[device.id] = room;
  }
  return rooms;
}

/** The next room for a device after a tap on `picked`: tapping the selected room clears it. */
export function nextRoom(current: string | undefined, picked: string): string {
  return current !== undefined && current.toLowerCase() === picked.toLowerCase() ? "" : picked;
}
