import { Device, DeviceCategory } from "../types/Device";

// ADR-HEARTH-193: which section of the Devices list a device's category belongs in. Every
// DeviceCategory is mapped here explicitly (a compile-time Record plus a test that reads the union
// from source), so a new category cannot silently land ungrouped or vanish.

export type DeviceTypeGroupId = "tvStreaming" | "audio" | "lights" | "plugs" | "cameras" | "gaming" | "vacuums" | "climate" | "covers" | "sensors" | "actions" | "other";

export interface DeviceTypeGroup {
  id: DeviceTypeGroupId;
  title: string;
}

/** The fixed top-to-bottom order of the type sections; TVs first, "Other" last. */
export const DEVICE_TYPE_GROUPS: readonly DeviceTypeGroup[] = [
  { id: "tvStreaming", title: "TVs & Streaming" },
  { id: "audio", title: "Audio" },
  { id: "lights", title: "Lights" },
  { id: "plugs", title: "Plugs & Outlets" },
  { id: "cameras", title: "Cameras" },
  { id: "gaming", title: "Gaming" },
  { id: "vacuums", title: "Vacuums & Robots" },
  { id: "climate", title: "Climate & Fans" },
  { id: "covers", title: "Covers & Locks" },
  { id: "sensors", title: "Sensors" },
  { id: "actions", title: "Actions & Scenes" },
  { id: "other", title: "Other" },
];

export const FALLBACK_DEVICE_TYPE_GROUP: DeviceTypeGroupId = "other";

/** Every category and the group it lives in. Alarm panels sit with locks (security), feeders with robots (an automatic motorised appliance). */
export const GROUP_BY_CATEGORY: Record<DeviceCategory, DeviceTypeGroupId> = {
  tv: "tvStreaming",
  streaming: "tvStreaming",
  audio: "audio",
  lighting: "lights",
  outlet: "plugs",
  camera: "cameras",
  gaming: "gaming",
  vacuum: "vacuums",
  feeder: "vacuums",
  climate: "climate",
  fan: "climate",
  cover: "covers",
  lock: "covers",
  alarm: "covers",
  sensor: "sensors",
  action: "actions",
  other: "other",
};

const KNOWN_GROUP_IDS: ReadonlySet<string> = new Set(DEVICE_TYPE_GROUPS.map((group) => group.id));

/** True when the text is one of the type-group ids (used to drop stale values read from storage). */
export function isDeviceTypeGroupId(value: string): value is DeviceTypeGroupId {
  return KNOWN_GROUP_IDS.has(value);
}

/** The group a device belongs in; a category this build does not know (for example from a newer phone or Pi) falls back to "Other" rather than disappearing. */
export function groupIdForDevice(device: Pick<Device, "category">): DeviceTypeGroupId {
  return GROUP_BY_CATEGORY[device.category] ?? FALLBACK_DEVICE_TYPE_GROUP;
}
