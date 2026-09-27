import { Device } from "../core/types/Device";
import { buildHomeAssistantDevice } from "../drivers/homeAssistant/haDeviceFactory";
import { HaImportCandidate, roomForCandidate } from "../drivers/homeAssistant/haImportCandidates";
import { saveHaInstance } from "../drivers/homeAssistant/haInstanceStore";
import { applyImportedRooms } from "./haImportRooms";

export interface HaImportResult {
  devices: Device[];
  /** Device id -> Hearth room, for the devices whose Home Assistant area became a room. */
  rooms: Record<string, string>;
}

/**
 * Saves the shared credential once, builds one Hearth device per chosen entity and writes their rooms
 * (from each entity's Home Assistant area) to the layout store; adding the devices to the app is the caller's step.
 */
export async function prepareHaImport(candidates: HaImportCandidate[], baseUrl: string, token: string): Promise<HaImportResult> {
  const instance = await saveHaInstance(baseUrl, token);
  const now = Date.now();
  const devices = candidates.map((candidate) => buildHomeAssistantDevice(candidate, instance, now));
  const rooms: Record<string, string> = {};
  candidates.forEach((candidate, index) => {
    const room = roomForCandidate(candidate);
    if (room) rooms[devices[index].id] = room;
  });
  await applyImportedRooms(rooms);
  return { devices, rooms };
}
