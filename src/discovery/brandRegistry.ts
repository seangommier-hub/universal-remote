import { DeviceDriver } from "../core/drivers/DeviceDriver";
import { DeviceCategory } from "../core/types/Device";
import { APPLE_TV_DRIVER_ID } from "../drivers/tv/appletv/AppleTvDriver";
import { BROADLINK_IR_DRIVER_ID } from "../drivers/irHub/broadlink/BroadlinkIrDriver";
import { CHROMECAST_DRIVER_ID } from "../drivers/streaming/chromecast/ChromecastDriver";
import { DENON_DRIVER_ID } from "../drivers/tv/denon/DenonDriver";
import { SQUIRREL_FEEDER_DRIVER_ID } from "../drivers/feeder/squirrelFeeder/SquirrelFeederDriver";
import { HUE_LIGHT_DRIVER_ID } from "../drivers/lighting/hue/HueLightDriver";
import { KASA_PLUG_DRIVER_ID } from "../drivers/outlet/kasa/KasaPlugDriver";
import { LG_WEBOS_DRIVER_ID } from "../drivers/tv/lg/LgWebOsDriver";
import { PS5_DRIVER_ID } from "../drivers/gaming/ps5/Ps5Driver";
import { ROKU_ECP_DRIVER_ID } from "../drivers/streaming/roku/RokuEcpDriver";
import { SAMSUNG_TIZEN_DRIVER_ID } from "../drivers/tv/samsung/SamsungTizenDriver";
import { SMARTTHINGS_OUTLET_DRIVER_ID } from "../drivers/outlet/smartthings/SmartThingsOutletDriver";
import { SONOS_DRIVER_ID } from "../drivers/audio/sonos/SonosDriver";
import { SONY_BRAVIA_DRIVER_ID } from "../drivers/tv/sony/SonyBraviaDriver";
import { SWITCHBOT_VACUUM_DRIVER_ID } from "../drivers/vacuum/switchbot/SwitchBotVacuumDriver";
import { XBOX_DRIVER_ID } from "../drivers/gaming/xbox/XboxDriver";
import { YAMAHA_MUSICCAST_DRIVER_ID } from "../drivers/tv/yamaha/YamahaMusicCastDriver";

// ADR-HEARTH-148: the ONE place a brand is described. Discovery matching, the SSDP search targets,
// the home "Add a device" picker, the discovered-row Add button and the generic add screen all read
// this list — adding a brand means adding one entry here (plus its driver), nothing else.

export type BrandId =
  | "lg"
  | "samsung"
  | "sony"
  | "roku"
  | "yamaha"
  | "denon"
  | "sonos"
  | "kasa"
  | "chromecast"
  | "appletv"
  | "ps5"
  | "xbox"
  | "hue"
  | "broadlink"
  | "feeder"
  | "smartthings"
  | "switchbot";

/** Kept for existing imports: every brand can be the target of an add flow. */
export type AddableBrand = BrandId;

export type BrandIcon = "tv-outline" | "play-circle-outline" | "musical-notes-outline" | "bulb-outline" | "flash-outline" | "game-controller-outline" | "radio-outline" | "hardware-chip-outline";

/**
 * How adding this brand works from a discovered row:
 *  - "ip-only": connects with just the IP (a name is generated).
 *  - "inline-fields": one tap, but the user must first type the listed `fields` (Sony PSK, Xbox Live ID).
 *  - "custom-screen": a multi-step pairing (Hue, PS5, Apple TV, SwitchBot, SmartThings) with its own screen.
 */
export type BrandAddMode = "ip-only" | "inline-fields" | "custom-screen";

export interface BrandField {
  /** Key written into `device.config`. */
  key: string;
  label: string;
  placeholder: string;
  /** Short "where do I find this" text shown next to the field. */
  help: string;
  secret?: boolean;
}

export interface BrandEntry {
  id: BrandId;
  label: string;
  driverId: string;
  manufacturer: string;
  category: DeviceCategory;
  icon: BrandIcon;
  defaultName: string;
  addMode: BrandAddMode;
  /** Only meaningful for "inline-fields". */
  fields: BrandField[];
  /** True when the driver can only work through Family Command Center's relay/pairing. */
  needsFcc: boolean;
  /** False for brands identified by an account/token rather than a LAN address (SmartThings, SwitchBot). */
  needsIp: boolean;
  /** Short one-line note shown in the generic add screen and brand picker. */
  hint: string;
  /** Matched against a device's hostname + MAC vendor; also used to sort the brand picker. */
  vendorPattern: RegExp | null;
  /** Listed in the home "Add a device" picker (the feeder has its own tab). */
  inAddPicker: boolean;
  /** Broadlink devices start with no buttons; every other driver reports its own capabilities. */
  startsWithNoCapabilities?: boolean;
}

const SONY_PSK_HELP = "On the TV: Settings → Network & Internet → Home Network → IP Control → Pre-Shared Key. Set one there if it is blank.";
const XBOX_LIVE_ID_HELP = "On the Xbox: Settings → System → Console info → Xbox Live device ID.";

function ipOnly(entry: Omit<BrandEntry, "addMode" | "fields" | "needsIp">): BrandEntry {
  return { ...entry, addMode: "ip-only", fields: [], needsIp: true };
}

// Order matters for vendor matching: PS5 must precede Sony (its MAC vendor is "Sony Interactive Entertainment").
export const BRAND_REGISTRY: BrandEntry[] = [
  ipOnly({
    id: "ps5", label: "PS5", driverId: PS5_DRIVER_ID, manufacturer: "Sony", category: "gaming", icon: "game-controller-outline", defaultName: "PS5",
    needsFcc: true, hint: "Pairs through Family Command Center with your PlayStation sign-in.", vendorPattern: /playstation|ps5|sony interactive/i, inAddPicker: true,
  }),
  {
    id: "sony", label: "Sony TV", driverId: SONY_BRAVIA_DRIVER_ID, manufacturer: "Sony", category: "tv", icon: "tv-outline", defaultName: "Sony TV",
    addMode: "inline-fields", needsFcc: false, needsIp: true, hint: "Needs IP Control turned on and a Pre-Shared Key.", vendorPattern: /sony/i, inAddPicker: true,
    fields: [{ key: "psk", label: "Pre-shared key", placeholder: "From the TV's IP Control settings", help: SONY_PSK_HELP, secret: true }],
  },
  ipOnly({
    id: "samsung", label: "Samsung TV", driverId: SAMSUNG_TIZEN_DRIVER_ID, manufacturer: "Samsung", category: "tv", icon: "tv-outline", defaultName: "Samsung TV",
    needsFcc: false, hint: "Accept the Allow prompt on the TV within 20 seconds.", vendorPattern: /samsung/i, inAddPicker: true,
  }),
  ipOnly({
    id: "lg", label: "LG TV", driverId: LG_WEBOS_DRIVER_ID, manufacturer: "LG", category: "tv", icon: "tv-outline", defaultName: "LG TV",
    needsFcc: true, hint: "Accept the Allow prompt on the TV within 30 seconds.", vendorPattern: /\blg\b|webos/i, inAddPicker: true,
  }),
  ipOnly({
    id: "roku", label: "Roku", driverId: ROKU_ECP_DRIVER_ID, manufacturer: "Roku", category: "streaming", icon: "play-circle-outline", defaultName: "Roku",
    needsFcc: false, hint: "Works for Roku players and Roku TVs — no pairing.", vendorPattern: /roku/i, inAddPicker: true,
  }),
  ipOnly({
    id: "yamaha", label: "Yamaha Receiver", driverId: YAMAHA_MUSICCAST_DRIVER_ID, manufacturer: "Yamaha", category: "tv", icon: "musical-notes-outline", defaultName: "Yamaha Receiver",
    needsFcc: false, hint: "Any MusicCast receiver or soundbar — no pairing.", vendorPattern: /yamaha/i, inAddPicker: true,
  }),
  ipOnly({
    id: "denon", label: "Denon / Marantz", driverId: DENON_DRIVER_ID, manufacturer: "Denon", category: "tv", icon: "musical-notes-outline", defaultName: "Denon Receiver",
    needsFcc: false, hint: "Denon and Marantz receivers — no pairing.", vendorPattern: /denon|marantz|d&m holdings/i, inAddPicker: true,
  }),
  ipOnly({
    id: "sonos", label: "Sonos Speaker", driverId: SONOS_DRIVER_ID, manufacturer: "Sonos", category: "audio", icon: "musical-notes-outline", defaultName: "Sonos Speaker",
    needsFcc: false, hint: "Volume, mute and play/pause — no pairing.", vendorPattern: /sonos/i, inAddPicker: true,
  }),
  ipOnly({
    id: "kasa", label: "TP-Link Kasa Plug", driverId: KASA_PLUG_DRIVER_ID, manufacturer: "TP-Link", category: "outlet", icon: "flash-outline", defaultName: "Kasa Plug",
    needsFcc: false, hint: "Older Kasa firmware only — no pairing.", vendorPattern: /tp-?link|\bkasa\b/i, inAddPicker: true,
  }),
  ipOnly({
    id: "chromecast", label: "Chromecast", driverId: CHROMECAST_DRIVER_ID, manufacturer: "Google", category: "streaming", icon: "tv-outline", defaultName: "Chromecast",
    needsFcc: true, hint: "Volume and mute, through Family Command Center.", vendorPattern: /chromecast/i, inAddPicker: true,
  }),
  {
    ...ipOnly({
      id: "broadlink", label: "IR/RF Hub (Broadlink)", driverId: BROADLINK_IR_DRIVER_ID, manufacturer: "Broadlink", category: "other", icon: "radio-outline", defaultName: "IR/RF Hub",
      needsFcc: true, hint: "Teach it buttons after adding; needs Family Command Center.", vendorPattern: /broadlink/i, inAddPicker: true,
    }),
    startsWithNoCapabilities: true,
  },
  ipOnly({
    id: "feeder", label: "Squirrel Feeder", driverId: SQUIRREL_FEEDER_DRIVER_ID, manufacturer: "DIY (ESP32)", category: "feeder", icon: "hardware-chip-outline", defaultName: "Squirrel Feeder",
    needsFcc: false, hint: "Your ESP32 feeder on the home Wi-Fi — no pairing.", vendorPattern: null, inAddPicker: false,
  }),
  {
    id: "xbox", label: "Xbox", driverId: XBOX_DRIVER_ID, manufacturer: "Microsoft", category: "gaming", icon: "game-controller-outline", defaultName: "Xbox",
    addMode: "inline-fields", needsFcc: false, needsIp: true, hint: "Power-on only; needs the console's Live ID.", vendorPattern: /xbox/i, inAddPicker: true,
    fields: [{ key: "liveId", label: "Xbox Live ID", placeholder: "FD00...", help: XBOX_LIVE_ID_HELP }],
  },
  {
    id: "appletv", label: "Apple TV", driverId: APPLE_TV_DRIVER_ID, manufacturer: "Apple", category: "streaming", icon: "tv-outline", defaultName: "Apple TV",
    addMode: "custom-screen", fields: [], needsFcc: true, needsIp: true, hint: "Pairs with a PIN shown on the TV.", vendorPattern: /apple ?tv/i, inAddPicker: true,
  },
  {
    id: "hue", label: "Philips Hue", driverId: HUE_LIGHT_DRIVER_ID, manufacturer: "Philips", category: "lighting", icon: "bulb-outline", defaultName: "Hue light",
    addMode: "custom-screen", fields: [], needsFcc: false, needsIp: true, hint: "Press the link button on the bridge, then pick a light.", vendorPattern: /philips.?hue|signify|hue bridge/i, inAddPicker: true,
  },
  {
    id: "switchbot", label: "SwitchBot Robot Vacuum", driverId: SWITCHBOT_VACUUM_DRIVER_ID, manufacturer: "SwitchBot", category: "vacuum", icon: "hardware-chip-outline", defaultName: "SwitchBot Vacuum",
    addMode: "custom-screen", fields: [], needsFcc: false, needsIp: false, hint: "Needs your SwitchBot token and secret.", vendorPattern: /switchbot/i, inAddPicker: true,
  },
  {
    id: "smartthings", label: "Sync from SmartThings", driverId: SMARTTHINGS_OUTLET_DRIVER_ID, manufacturer: "SmartThings", category: "outlet", icon: "flash-outline", defaultName: "SmartThings outlet",
    addMode: "custom-screen", fields: [], needsFcc: false, needsIp: false, hint: "Cloud-linked outlets; needs a SmartThings token.", vendorPattern: null, inAddPicker: true,
  },
];

const BY_ID = new Map<BrandId, BrandEntry>(BRAND_REGISTRY.map((brand) => [brand.id, brand]));
const BY_DRIVER_ID = new Map<string, BrandEntry>(BRAND_REGISTRY.map((brand) => [brand.driverId, brand]));

/** The brand entry for an id. */
export function getBrand(id: BrandId): BrandEntry {
  return BY_ID.get(id) as BrandEntry;
}

/** The brand whose driver has this id, if any. */
export function brandForDriverId(driverId: string): BrandEntry | undefined {
  return BY_DRIVER_ID.get(driverId);
}

/** True when `value` is a known brand id (guards untrusted endpoint data). */
export function isBrandId(value: unknown): value is BrandId {
  return typeof value === "string" && BY_ID.has(value as BrandId);
}

/** First brand whose vendor pattern matches the hostname/vendor text, or undefined. */
export function matchBrandByText(text: string): BrandEntry | undefined {
  return BRAND_REGISTRY.find((brand) => brand.vendorPattern !== null && brand.vendorPattern.test(text));
}

/** Brands offered in the home "Add a device" picker, in registry order. */
export function addPickerBrands(): BrandEntry[] {
  return BRAND_REGISTRY.filter((brand) => brand.inAddPicker);
}

/** Brands that can be chosen for a specific network address, best vendor guess first. */
export function brandsForAddress(hostname: string | null, vendor: string | null): BrandEntry[] {
  const text = `${hostname ?? ""} ${vendor ?? ""}`;
  const candidates = BRAND_REGISTRY.filter((brand) => brand.needsIp && brand.id !== "feeder");
  const guessed = matchBrandByText(text);
  if (!guessed) return candidates;
  return [guessed, ...candidates.filter((brand) => brand.id !== guessed.id)];
}

/** The capabilities a fresh device of this brand starts with. */
export function initialCapabilities(brand: BrandEntry, driver: DeviceDriver): ReturnType<DeviceDriver["getCapabilities"]> {
  return brand.startsWithNoCapabilities ? [] : driver.getCapabilities();
}
