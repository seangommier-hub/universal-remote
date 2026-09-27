// ADR-HEARTH-173: how this phone arranges its Devices list. Local only: a shared device is re-imported by sync, which would overwrite anything stored on the Device itself.

export const MAX_ROOM_NAME_LENGTH = 30;
export const ROOM_SUGGESTIONS = ["Living Room", "Den", "Bedroom", "Kitchen", "Office", "Kids", "Basement", "Garage"] as const;

export interface DeviceLayout {
  /** Device id to room name, as the person typed it (trimmed). */
  rooms: Record<string, string>;
  /** Device ids in the order the person starred them. */
  favorites: string[];
  /** Device ids in the person's chosen order; ids not listed keep their original order after the listed ones. */
  order: string[];
  /** Lowercase room keys whose section is collapsed. */
  collapsedRooms: string[];
}

/** A layout with nothing set, which renders the flat list as it always was. */
export function emptyLayout(): DeviceLayout {
  return { rooms: {}, favorites: [], order: [], collapsedRooms: [] };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0)));
}

/** The trimmed, single-spaced, length-capped form of a typed room name; empty when there is nothing usable. */
export function cleanRoomName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_ROOM_NAME_LENGTH).trim();
}

/** The key rooms are grouped by, so "den" and "Den" are one room. */
export function roomKey(name: string): string {
  return cleanRoomName(name).toLowerCase();
}

/** Turns anything read from storage (missing, old, or damaged) into a valid layout. */
export function normalizeLayout(raw: unknown): DeviceLayout {
  if (typeof raw !== "object" || raw === null) return emptyLayout();
  const stored = raw as Record<string, unknown>;
  const rooms: Record<string, string> = {};
  if (typeof stored.rooms === "object" && stored.rooms !== null) {
    for (const [id, name] of Object.entries(stored.rooms)) {
      const cleaned = typeof name === "string" ? cleanRoomName(name) : "";
      if (cleaned) rooms[id] = cleaned;
    }
  }
  return { rooms, favorites: stringList(stored.favorites), order: stringList(stored.order), collapsedRooms: stringList(stored.collapsedRooms) };
}

/** Puts a device in a room; an empty name takes it out of any room. */
export function setDeviceRoom(layout: DeviceLayout, deviceId: string, roomName: string): DeviceLayout {
  const cleaned = cleanRoomName(roomName);
  const rooms = { ...layout.rooms };
  if (cleaned) rooms[deviceId] = cleaned;
  else delete rooms[deviceId];
  return { ...layout, rooms };
}

/** Adds the device to Favorites, or removes it when already there. */
export function toggleFavorite(layout: DeviceLayout, deviceId: string): DeviceLayout {
  const favorites = layout.favorites.includes(deviceId) ? layout.favorites.filter((id) => id !== deviceId) : [...layout.favorites, deviceId];
  return { ...layout, favorites };
}

/** Flips one room section between collapsed and open. */
export function toggleRoomCollapsed(layout: DeviceLayout, key: string): DeviceLayout {
  const collapsedRooms = layout.collapsedRooms.includes(key) ? layout.collapsedRooms.filter((k) => k !== key) : [...layout.collapsedRooms, key];
  return { ...layout, collapsedRooms };
}

/** Forgets everything stored about devices that no longer exist. */
export function pruneLayout(layout: DeviceLayout, existingIds: readonly string[]): DeviceLayout {
  const alive = new Set(existingIds);
  const rooms: Record<string, string> = {};
  for (const [id, name] of Object.entries(layout.rooms)) if (alive.has(id)) rooms[id] = name;
  return { ...layout, rooms, favorites: layout.favorites.filter((id) => alive.has(id)), order: layout.order.filter((id) => alive.has(id)) };
}

/** The room names already in use, for offering alongside the built-in suggestions. */
export function roomsInUse(layout: DeviceLayout): string[] {
  return Array.from(new Set(Object.values(layout.rooms)));
}

/** Built-in suggestions plus rooms already in use, without duplicates by case. */
export function roomChoices(layout: DeviceLayout): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of [...roomsInUse(layout), ...ROOM_SUGGESTIONS]) {
    const key = roomKey(name);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}
