import type { Ionicons } from "@expo/vector-icons";
import type { DeviceCategory } from "../core/types/Device";

// ADR-HEARTH-153: what KIND of thing a network device is, independent of whether Hearth has a
// driver for it. The Pi sends `kind`; when it is missing (older Pi) a light client-side guess from
// the vendor/hostname keeps the Discover screen grouped instead of one flat wall of rows.

export type DeviceKind = "tv" | "streaming" | "audio" | "console" | "lighting" | "outlet" | "camera" | "phone" | "computer" | "network" | "printer" | "iot" | "unknown";

export const DEVICE_KINDS: DeviceKind[] = ["tv", "streaming", "audio", "console", "lighting", "outlet", "camera", "phone", "computer", "network", "printer", "iot", "unknown"];

export type KindIcon = keyof typeof Ionicons.glyphMap;

export const KIND_ICON: Record<DeviceKind, KindIcon> = {
  tv: "tv-outline",
  streaming: "play-circle-outline",
  audio: "musical-notes-outline",
  console: "game-controller-outline",
  lighting: "bulb-outline",
  outlet: "flash-outline",
  camera: "videocam-outline",
  phone: "phone-portrait-outline",
  computer: "laptop-outline",
  network: "wifi-outline",
  printer: "print-outline",
  iot: "hardware-chip-outline",
  unknown: "help-circle-outline",
};

export const KIND_LABEL: Record<DeviceKind, string> = {
  tv: "TV",
  streaming: "Streaming device",
  audio: "Speaker",
  console: "Game console",
  lighting: "Lighting",
  outlet: "Smart plug",
  camera: "Camera",
  phone: "Phone",
  computer: "Computer",
  network: "Network gear",
  printer: "Printer",
  iot: "Smart device",
  unknown: "Unknown device",
};

export type KindGroupId = "media" | "cameras" | "phones-computers" | "network" | "other";

export interface KindGroup {
  id: KindGroupId;
  title: string;
}

/** Display order of the groups under "Other devices on your network". */
export const KIND_GROUPS: KindGroup[] = [
  { id: "media", title: "TVs & media" },
  { id: "cameras", title: "Cameras" },
  { id: "phones-computers", title: "Phones & computers" },
  { id: "network", title: "Network gear" },
  { id: "other", title: "Other" },
];

const GROUP_OF_KIND: Record<DeviceKind, KindGroupId> = {
  tv: "media",
  streaming: "media",
  audio: "media",
  console: "media",
  camera: "cameras",
  phone: "phones-computers",
  computer: "phones-computers",
  network: "network",
  lighting: "other",
  outlet: "other",
  printer: "other",
  iot: "other",
  unknown: "other",
};

/** Lower is more likely to be something a person wants to control from a remote. */
const CANDIDATE_RANK: Record<DeviceKind, number> = {
  tv: 0,
  streaming: 0,
  console: 0,
  audio: 1,
  lighting: 1,
  outlet: 1,
  iot: 2,
  unknown: 3,
  printer: 4,
  camera: 5,
  computer: 6,
  phone: 6,
  network: 7,
};

const CATEGORY_KIND: Partial<Record<DeviceCategory, DeviceKind>> = {
  tv: "tv",
  streaming: "streaming",
  audio: "audio",
  lighting: "lighting",
  outlet: "outlet",
  gaming: "console",
};

// Order matters: the first matching pattern wins (a "Ring camera" must not fall to a generic word).
const KIND_PATTERNS: Array<[DeviceKind, RegExp]> = [
  ["camera", /\b(ring|arlo|wyze|blink|reolink|hikvision|nest ?cam|doorbell|camera|cam)\b/i],
  ["console", /xbox|playstation|\bps[45]\b|nintendo/i],
  ["streaming", /roku|chromecast|fire ?tv|firestick|apple ?tv|appletv|nvidia shield|google ?tv streamer|android ?tv box/i],
  ["audio", /sonos|\becho\b|alexa|homepod|soundbar|denon|yamaha|speaker|amazon/i],
  ["tv", /\btv\b|bravia|webos|television|vizio|hisense|tcl/i],
  ["lighting", /\bhue\b|lifx|nanoleaf|philips|bulb|light/i],
  ["outlet", /kasa|\bplug\b|outlet|smartthings|wemo/i],
  ["printer", /printer|laserjet|officejet|epson|brother|canon|\bhp\b/i],
  ["network", /router|netgear|ubiquiti|unifi|linksys|eero|orbi|arris|modem|gateway|access ?point|tp-?link|asus|cisco|zyxel|\bswitch\b/i],
  ["phone", /iphone|ipad|android|galaxy|pixel|oneplus|polycom|yealink|grandstream|voip|\bphone\b/i],
  ["computer", /macbook|imac|laptop|desktop|thinkpad|\bpc\b|dell|lenovo|windows|intel|microsoft|apple/i],
  ["iot", /espressif|tuya|shelly|\besp\b|raspberry/i],
];

export interface KindEvidence {
  hostname: string | null;
  vendor: string | null;
  friendlyName: string | null;
  model: string | null;
}

/** True for a value that is one of the known device kinds (guards untrusted endpoint data). */
export function isDeviceKind(value: unknown): value is DeviceKind {
  return typeof value === "string" && (DEVICE_KINDS as string[]).includes(value);
}

/** Light client-side kind guess from names and vendor; "unknown" when nothing matches. */
export function guessDeviceKind(evidence: KindEvidence): DeviceKind {
  const text = [evidence.friendlyName, evidence.model, evidence.hostname, evidence.vendor].filter(Boolean).join(" ");
  if (!text) return "unknown";
  return KIND_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? "unknown";
}

/** The kind implied by a recognized brand's category, when it has one. */
export function kindForCategory(category: DeviceCategory): DeviceKind | null {
  return CATEGORY_KIND[category] ?? null;
}

/** Which "Other devices" group this kind is listed under. */
export function groupOfKind(kind: DeviceKind): KindGroupId {
  return GROUP_OF_KIND[kind];
}

/** Sort weight: likely remote-controllable kinds first. */
export function candidateRank(kind: DeviceKind): number {
  return CANDIDATE_RANK[kind];
}
