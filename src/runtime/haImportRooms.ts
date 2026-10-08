import { setDeviceRoom } from "../core/layout/deviceLayout";
import { loadDeviceLayout, saveDeviceLayout } from "./deviceLayoutPersistence";

/** Puts each device in its room in this phone's layout store (ADR-HEARTH-173), in one read and one write; empty room names are skipped. */
export async function applyImportedRooms(roomsByDeviceId: Record<string, string>): Promise<void> {
  const entries = Object.entries(roomsByDeviceId).filter(([, room]) => room.length > 0);
  if (entries.length === 0) return;
  let layout = await loadDeviceLayout();
  for (const [deviceId, room] of entries) layout = setDeviceRoom(layout, deviceId, room);
  await saveDeviceLayout(layout);
}

/** Like applyImportedRooms, but an empty name takes that device OUT of its room (the add screens' "no room" choice). */
export async function applyRoomChoices(roomsByDeviceId: Record<string, string>): Promise<void> {
  const entries = Object.entries(roomsByDeviceId);
  if (entries.length === 0) return;
  let layout = await loadDeviceLayout();
  for (const [deviceId, room] of entries) layout = setDeviceRoom(layout, deviceId, room);
  await saveDeviceLayout(layout);
}
