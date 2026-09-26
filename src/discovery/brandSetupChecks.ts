import { Device } from "../core/types/Device";
import { BrandId, brandForDriverId } from "./brandRegistry";

/** Which setup checks Hearth can verify on its own; everything else is a manual confirmation (ADR-HEARTH-154). */
export type AutoCheckId = "mac-known" | "fcc-reachable" | "device-answers";

export interface SetupCheck {
  id: string;
  title: string;
  /** One line on why this matters, in plain words. */
  why: string;
  /** Where to find the setting on the device (menu path or instruction). */
  where: string;
  /** Set when Hearth verifies it automatically; absent means the user confirms it by hand. */
  auto?: AutoCheckId;
  /** Only shown on this phone platform (undefined = every platform). */
  platform?: "ios";
}

export interface BrandSetup {
  brand: BrandId;
  /** The specific likely cause shown when a wake test times out, ending with the offer to show the settings. */
  wakeFailureHint: string;
  checks: SetupCheck[];
}

const MAC_CHECK: SetupCheck = {
  id: "mac-known",
  title: "Hearth knows the device's MAC address",
  why: "Wake-on-LAN needs it to address the wake-up packet.",
  where: "Re-add from Discover, or Edit address, while the device is on so Hearth can learn it.",
  auto: "mac-known",
};

const FCC_CHECK: SetupCheck = {
  id: "fcc-reachable",
  title: "Family Command Center is reachable",
  why: "It sends the wake-up packet for your phone.",
  where: "Devices tab > Connect Family Command Center.",
  auto: "fcc-reachable",
};

const LOCAL_NETWORK_CHECK: SetupCheck = {
  id: "ios-local-network",
  title: "Hearth may use the Local Network",
  why: "Without it iOS silently blocks every request to devices at home.",
  where: "iPhone Settings > Hearth > Local Network = On.",
  platform: "ios",
};

/** Brand-specific wake and connection gotchas; a brand appears here only when the entries are true for it. */
export const BRAND_SETUP_TABLE: BrandSetup[] = [
  {
    brand: "lg",
    wakeFailureHint: "The TV never answered. On LG this is usually Quick Start+ or 'TV On With Mobile'.",
    checks: [
      MAC_CHECK,
      FCC_CHECK,
      {
        id: "lg-quick-start",
        title: "Quick Start+ is off (or Always Ready is on)",
        why: "webOS 6 TVs with Quick Start+ on ignore Wake-on-LAN; 2022 and newer models use Always Ready instead.",
        where: "Settings > General > System > Additional Settings > Quick Start+ (2022+: Always Ready).",
      },
      {
        id: "lg-tv-on-with-mobile",
        title: "'TV On With Mobile' is on",
        why: "Otherwise the TV ignores wake-up packets from a phone.",
        where: "Settings > General > External Devices > TV On With / Mobile TV On > Turn on via Wi-Fi.",
      },
      {
        id: "lg-allow-prompt",
        title: "You tapped Allow on the TV the first time",
        why: "The TV asks once to let Hearth control it; without that tap it refuses commands.",
        where: "Shown on the TV screen the first time Hearth connects.",
      },
      {
        id: "lg-same-vlan",
        title: "The TV is on the same network as this phone",
        why: "Wake-on-LAN works on one network segment only, so a TV on a guest or other VLAN never wakes.",
        where: "Router settings: put the TV and Family Command Center on the same network.",
      },
      LOCAL_NETWORK_CHECK,
    ],
  },
  {
    brand: "samsung",
    wakeFailureHint: "The TV never answered. On Samsung this is usually 'Power on with Mobile' being off.",
    checks: [
      MAC_CHECK,
      FCC_CHECK,
      {
        id: "samsung-power-on-with-mobile",
        title: "'Power on with Mobile' is on",
        why: "Samsung TVs only wake from a phone when this is enabled.",
        where: "Settings > General > Network > Expert Settings > Power On with Mobile.",
      },
      {
        id: "samsung-allow-popup",
        title: "You tapped Allow on the TV",
        why: "Hearth connects on port 8002 (secure) and the TV asks for permission once.",
        where: "Popup on the TV screen the first time Hearth connects.",
      },
      LOCAL_NETWORK_CHECK,
    ],
  },
  {
    brand: "sony",
    wakeFailureHint: "The TV never answered. On Sony this is usually IP Control or 'Remote Start' being off.",
    checks: [
      MAC_CHECK,
      FCC_CHECK,
      {
        id: "sony-ip-control",
        title: "IP Control and Pre-Shared Key are on",
        why: "Bravia only accepts Hearth's commands through IP Control with the key you entered.",
        where: "Settings > Network > Home Network Setup > IP Control.",
      },
      {
        id: "sony-remote-start",
        title: "'Remote Start' is on",
        why: "Without it the TV will not wake from standby over the network.",
        where: "Settings > Network > Home Network Setup > Remote Start.",
      },
      LOCAL_NETWORK_CHECK,
    ],
  },
  {
    brand: "roku",
    wakeFailureHint: "The Roku never answered. Check that Network access is Permissive, and 'Fast TV start' is on for Roku TVs.",
    checks: [
      {
        id: "roku-network-access",
        title: "Control by mobile apps is set to Permissive",
        why: "Otherwise the Roku answers every command with 403 Forbidden.",
        where: "Settings > System > Advanced system settings > Control by mobile apps > Network access = Permissive.",
      },
      {
        id: "roku-fast-tv-start",
        title: "'Fast TV start' is on (Roku TVs)",
        why: "A Roku TV only wakes over the network while this is enabled.",
        where: "Settings > System > Power > Fast TV start.",
      },
      {
        id: "roku-answers",
        title: "The Roku answers Hearth right now",
        why: "Confirms the address and network access work.",
        where: "Turn the Roku on, then open this list again.",
        auto: "device-answers",
      },
      LOCAL_NETWORK_CHECK,
    ],
  },
  {
    brand: "appletv",
    wakeFailureHint: "The Apple TV never answered. Pair it once with the PIN shown on screen, and keep it on the same network.",
    checks: [
      FCC_CHECK,
      {
        id: "appletv-paired",
        title: "You paired once with the PIN on the screen",
        why: "Apple TV refuses control until a PIN pairing succeeds.",
        where: "The 4-digit PIN appears on the TV during pairing.",
      },
      LOCAL_NETWORK_CHECK,
    ],
  },
  {
    brand: "androidtv",
    wakeFailureHint: "The TV never answered. Pair it once with the code shown on screen, and turn on Wake on LAN / Wake on Cast so it can be woken from standby.",
    checks: [
      FCC_CHECK,
      {
        id: "androidtv-paired",
        title: "You paired once with the code on the screen",
        why: "Google TV / Android TV refuses control until a 6-character code pairing succeeds.",
        where: "The code appears on the TV while Hearth starts pairing.",
      },
      {
        id: "androidtv-wake",
        title: "Wake on LAN / Wake on Cast is on",
        why: "A TV in deep standby only answers a network wake-up while this is enabled; some models cannot be woken over Wi-Fi at all.",
        where: "Settings > Network & Internet > (your network) > Wake on LAN / Wake on Cast, or Settings > System > Power & energy.",
      },
      LOCAL_NETWORK_CHECK,
    ],
  },
  {
    brand: "xbox",
    wakeFailureHint: "The Xbox never answered. It must be set to Instant-on and use the right Live ID.",
    checks: [
      {
        id: "xbox-instant-on",
        title: "Power mode is Instant-on",
        why: "Energy-saving mode turns the network off, so the Xbox cannot hear the wake-up.",
        where: "Settings > General > Power mode & startup > Power mode = Instant-on.",
      },
      {
        id: "xbox-live-id",
        title: "The Live ID matches this console",
        why: "The power-on message is addressed to that ID; a wrong one is ignored.",
        where: "Settings > System > Console info > Xbox Live device ID.",
      },
      LOCAL_NETWORK_CHECK,
    ],
  },
  {
    brand: "ps5",
    wakeFailureHint: "The PS5 never answered. Rest Mode must stay connected to the internet and allow network wake.",
    checks: [
      FCC_CHECK,
      {
        id: "ps5-rest-mode",
        title: "Rest Mode stays connected to the internet",
        why: "Otherwise the PS5 network stack shuts down when it sleeps.",
        where: "Settings > System > Power Saving > Features Available in Rest Mode > Stay Connected to the Internet.",
      },
      {
        id: "ps5-network-wake",
        title: "'Enable turning on PS5 from network' is on",
        why: "Lets a phone wake the console from Rest Mode.",
        where: "Settings > System > Power Saving > Features Available in Rest Mode > Enable Turning on PS5 from Network.",
      },
      LOCAL_NETWORK_CHECK,
    ],
  },
];

const BY_BRAND = new Map<BrandId, BrandSetup>(BRAND_SETUP_TABLE.map((entry) => [entry.brand, entry]));

/** The setup entry for the device's brand, or undefined when the brand has no wake guidance. */
export function getBrandSetup(device: Device): BrandSetup | undefined {
  const brand = brandForDriverId(device.driverId);
  return brand ? BY_BRAND.get(brand.id) : undefined;
}

/** True when the device declares a way to be switched on (powerOn, or a toggle power that wakes it). */
export function hasPowerOnPath(device: Device): boolean {
  return device.capabilities.includes("powerOn") || device.capabilities.includes("power");
}

/** The checks to show for a device on a given platform; empty when there is no power-on path or no brand guidance. */
export function checksForDevice(device: Device, platform: string): SetupCheck[] {
  const setup = getBrandSetup(device);
  if (!setup || !hasPowerOnPath(device)) return [];
  return setup.checks.filter((check) => check.platform === undefined || check.platform === platform);
}

/** The brand-specific message for a wake test that timed out; a neutral network hint for an unknown brand. */
export function wakeFailureMessage(device: Device): string {
  return getBrandSetup(device)?.wakeFailureHint ?? "The device never answered. Check that it can be switched on over the network.";
}
