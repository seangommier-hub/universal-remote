import { Device } from "../types/Device";
import { DeviceLayout, roomKey } from "./deviceLayout";
import { applyDeviceOrder } from "./deviceOrdering";

export const UNASSIGNED_ROOM_TITLE = "Other devices";
export const UNASSIGNED_ROOM_KEY = "";

export interface DeviceSection {
  /** Lowercase room key; empty for devices with no room. */
  key: string;
  title: string;
  devices: Device[];
  collapsed: boolean;
}

export interface DeviceListModel {
  /** Starred devices in the order they were starred, shown as a compact row above the list. */
  favorites: Device[];
  /** True when at least one device has a room; false means one flat list with no headers. */
  grouped: boolean;
  sections: DeviceSection[];
}

/** Arranges devices into the favorites row and room sections; with no rooms set it returns a single untitled section in the saved order. */
export function buildDeviceListModel(devices: readonly Device[], layout: DeviceLayout): DeviceListModel {
  const ordered = applyDeviceOrder(devices, layout.order);
  const byId = new Map(devices.map((d) => [d.id, d]));
  const favorites = layout.favorites.map((id) => byId.get(id)).filter((d): d is Device => d !== undefined);
  const hasRooms = ordered.some((d) => layout.rooms[d.id] !== undefined);
  if (!hasRooms) return { favorites, grouped: false, sections: [{ key: UNASSIGNED_ROOM_KEY, title: "", devices: ordered, collapsed: false }] };

  const titles = new Map<string, string>();
  const devicesByKey = new Map<string, Device[]>();
  for (const device of ordered) {
    const name = layout.rooms[device.id];
    const key = name === undefined ? UNASSIGNED_ROOM_KEY : roomKey(name);
    devicesByKey.set(key, [...(devicesByKey.get(key) ?? []), device]);
    if (name !== undefined && !titles.has(key)) titles.set(key, name);
  }
  const roomKeys = [...titles.keys()].sort((a, b) => a.localeCompare(b));
  const keys = devicesByKey.has(UNASSIGNED_ROOM_KEY) ? [...roomKeys, UNASSIGNED_ROOM_KEY] : roomKeys;
  const sections = keys.map((key) => ({
    key,
    title: key === UNASSIGNED_ROOM_KEY ? UNASSIGNED_ROOM_TITLE : (titles.get(key) ?? key),
    devices: devicesByKey.get(key) ?? [],
    collapsed: layout.collapsedRooms.includes(key),
  }));
  return { favorites, grouped: true, sections };
}

/** The ids of every device shown in the same section as the given one, in display order. */
export function sectionMateIds(model: DeviceListModel, deviceId: string): string[] {
  return model.sections.find((s) => s.devices.some((d) => d.id === deviceId))?.devices.map((d) => d.id) ?? [];
}
