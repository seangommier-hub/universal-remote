import { Device } from "../types/Device";
import { DeviceLayout, GroupByMode, roomKey } from "./deviceLayout";
import { applyDeviceOrder } from "./deviceOrdering";
import { DEVICE_TYPE_GROUPS, groupIdForDevice } from "./deviceTypeGroups";

export const UNASSIGNED_ROOM_TITLE = "Other devices";
export const UNASSIGNED_ROOM_KEY = "";

export interface DeviceSection {
  /** In room mode the lowercase room key (empty for devices with no room); in type mode the type-group id. */
  key: string;
  title: string;
  devices: Device[];
  collapsed: boolean;
}

export interface DeviceListModel {
  /** Which grouping produced the sections; decides which collapsed list a header tap changes. */
  mode: GroupByMode;
  /** Starred devices in the order they were starred, shown as a compact row above the list. */
  favorites: Device[];
  /** True when the sections get headers; false (room mode with no rooms set) means one flat list. */
  grouped: boolean;
  sections: DeviceSection[];
}

/** Arranges devices into the favorites row and either type sections (the default) or room sections, per the layout's group-by choice. */
export function buildDeviceListModel(devices: readonly Device[], layout: DeviceLayout): DeviceListModel {
  const ordered = applyDeviceOrder(devices, layout.order);
  const byId = new Map(devices.map((d) => [d.id, d]));
  const favorites = layout.favorites.map((id) => byId.get(id)).filter((d): d is Device => d !== undefined);
  return layout.groupBy === "room" ? buildRoomModel(ordered, favorites, layout) : buildTypeModel(ordered, favorites, layout);
}

/** Type mode (ADR-HEARTH-193): one section per non-empty device type in the fixed order, each keeping the saved device order. */
function buildTypeModel(ordered: readonly Device[], favorites: Device[], layout: DeviceLayout): DeviceListModel {
  const sections = DEVICE_TYPE_GROUPS.map((group) => ({
    key: group.id,
    title: group.title,
    devices: ordered.filter((device) => groupIdForDevice(device) === group.id),
    collapsed: layout.collapsedTypes.includes(group.id),
  })).filter((section) => section.devices.length > 0);
  return { mode: "type", favorites, grouped: true, sections };
}

/** Room mode (ADR-HEARTH-173): with no rooms set it returns a single untitled section in the saved order. */
function buildRoomModel(ordered: readonly Device[], favorites: Device[], layout: DeviceLayout): DeviceListModel {
  const hasRooms = ordered.some((d) => layout.rooms[d.id] !== undefined);
  if (!hasRooms) return { mode: "room", favorites, grouped: false, sections: [{ key: UNASSIGNED_ROOM_KEY, title: "", devices: [...ordered], collapsed: false }] };

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
  return { mode: "room", favorites, grouped: true, sections };
}

/** The ids of every device shown in the same section as the given one, in display order. */
export function sectionMateIds(model: DeviceListModel, deviceId: string): string[] {
  return model.sections.find((s) => s.devices.some((d) => d.id === deviceId))?.devices.map((d) => d.id) ?? [];
}
