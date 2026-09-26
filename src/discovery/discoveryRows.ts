import { Device } from "../core/types/Device";
import { BrandEntry, getBrand } from "./brandRegistry";
import { DeviceKind, guessDeviceKind, kindForCategory, KIND_LABEL } from "./deviceKind";
import { NetworkDevice } from "./discoverAll";
import { DeviceLabels, labelKey } from "./discoveryLabels";

// ADR-HEARTH-148 / 153: turns the raw network list plus the already-added devices and the person's
// own labels into the rows the Discover screen and the home "Suggested" list render. Pure, so the
// recognized / unknown / already-added / hidden decisions are unit-tested instead of living in JSX.

/** What a row's single primary button does. */
export type RowAction = "add" | "identify" | "added";

export const UNKNOWN_DEVICE_TITLE = "Unknown device";

export interface DiscoveryRow {
  device: NetworkDevice;
  /** The brand after the person's / household's override is applied. */
  brand: BrandEntry | null;
  action: RowAction;
  title: string;
  subtitle: string;
  kind: DeviceKind;
  online: boolean;
  hidden: boolean;
}

export interface DiscoveryRows {
  identified: DiscoveryRow[];
  other: DiscoveryRow[];
}

/** The already-added device that is this network device, matched by MAC first and address second. */
export function findAddedDevice(network: NetworkDevice, added: Device[]): Device | undefined {
  return added.find((device) => {
    const hwaddr = typeof device.config?.hwaddr === "string" ? device.config.hwaddr.toLowerCase() : null;
    if (hwaddr && network.mac && hwaddr === network.mac) return true;
    const addresses = [device.config?.ipAddress, device.config?.bridgeIpAddress];
    return addresses.includes(network.ip);
  });
}

function titleFor(device: NetworkDevice, brand: BrandEntry | null): string {
  if (device.friendlyName) return device.friendlyName;
  if (brand) return device.model ? `${brand.label} · ${device.model}` : brand.label;
  return device.model ?? device.hostname ?? device.vendor ?? UNKNOWN_DEVICE_TITLE;
}

function reasonFor(device: NetworkDevice, brand: BrandEntry | null): string | null {
  if (!brand) return device.vendor;
  if (device.brand !== brand.id) return `Set to ${brand.label}`;
  if (device.confidence === "certain") return `Answered as ${brand.label}`;
  if (device.confidence === "likely") return `Looks like ${brand.label}`;
  return `Best guess: ${brand.label}`;
}

function subtitleFor(device: NetworkDevice, brand: BrandEntry | null, kind: DeviceKind): string {
  const reason = reasonFor(device, brand) ?? (kind === "unknown" ? null : KIND_LABEL[kind]);
  const parts = [device.ip, reason, device.online ? null : "Off right now"];
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function kindFor(device: NetworkDevice, brand: BrandEntry | null): DeviceKind {
  if (device.kind && device.kind !== "unknown") return device.kind;
  const fromBrand = brand ? kindForCategory(brand.category) : null;
  if (fromBrand) return fromBrand;
  return guessDeviceKind(device);
}

function isHidden(device: NetworkDevice, labels: DeviceLabels): boolean {
  return labels[labelKey(device)]?.hidden ?? device.hidden;
}

function actionFor(device: NetworkDevice, brand: BrandEntry | null, added: Device[]): RowAction {
  if (findAddedDevice(device, added)) return "added";
  return brand ? "add" : "identify";
}

/** Builds the row for one network device, applying the person's own labels over what the Pi said. */
export function toDiscoveryRow(device: NetworkDevice, added: Device[], labels: DeviceLabels = {}): DiscoveryRow {
  const brandId = labels[labelKey(device)]?.brand ?? device.labelBrand ?? device.brand;
  const brand = brandId ? getBrand(brandId) : null;
  const kind = kindFor(device, brand);
  return {
    device,
    brand,
    action: actionFor(device, brand, added),
    title: titleFor(device, brand),
    subtitle: subtitleFor(device, brand, kind),
    kind,
    online: device.online,
    hidden: isHidden(device, labels),
  };
}

const OCTET_WIDTH = 3;
const NAMELESS_SORTS_LAST = "￿";

/** Named devices sort alphabetically; ones known only by address go last, in numeric address order. */
function sortKey(row: DiscoveryRow): string {
  const paddedIp = row.device.ip.split(".").map((octet) => octet.padStart(OCTET_WIDTH, "0")).join(".");
  const name = row.title === UNKNOWN_DEVICE_TITLE ? NAMELESS_SORTS_LAST : row.title.toLowerCase();
  return `${name}|${paddedIp}`;
}

/** Alphabetical comparator (nameless last) shared by every list. */
export function compareByName(a: DiscoveryRow, b: DiscoveryRow): number {
  return sortKey(a) < sortKey(b) ? -1 : 1;
}

/** Builds one row per network device: identified brands first, then everything else; nothing is dropped. */
export function buildDiscoveryRows(devices: NetworkDevice[], added: Device[], labels: DeviceLabels = {}): DiscoveryRows {
  const rows = devices.map((device) => toDiscoveryRow(device, added, labels));
  return {
    identified: rows.filter((row) => row.brand !== null).sort(compareByName),
    other: rows.filter((row) => row.brand === null).sort(compareByName),
  };
}

/** Every row that could still be added, identified ones first. */
export function notYetAdded(rows: DiscoveryRows): DiscoveryRow[] {
  return [...rows.identified, ...rows.other].filter((row) => row.action !== "added");
}

/** The label on a row's single primary button. */
export function primaryLabelFor(row: DiscoveryRow): string {
  if (row.action === "added") return "Added";
  if (row.action === "identify") return "Identify";
  return row.online ? "Add" : "Add anyway";
}

/** Looks the address up again in a fresh scan; returns the sighting only if it now has a brand. */
export async function reidentify(row: DiscoveryRow, rescan: () => Promise<NetworkDevice[]>): Promise<NetworkDevice | null> {
  const sightings = await rescan();
  const again = sightings.find((candidate) => candidate.ip === row.device.ip);
  return again && again.brand ? again : null;
}
