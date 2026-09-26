import { Device } from "../core/types/Device";
import { BrandEntry, getBrand } from "./brandRegistry";
import { NetworkDevice } from "./discoverAll";

// ADR-HEARTH-148: turns the raw network list plus the already-added devices into the rows the
// Discover screen and the home "Suggested" list render. Pure, so the recognized / unknown /
// already-added decision is unit-tested instead of living in JSX.

/** What a row's single primary button does. */
export type RowAction = "add" | "identify" | "added";

export interface DiscoveryRow {
  device: NetworkDevice;
  brand: BrandEntry | null;
  action: RowAction;
  title: string;
  subtitle: string;
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
  if (brand) return device.model ? `${brand.label} · ${device.model}` : brand.label;
  return device.hostname ?? device.vendor ?? device.ip;
}

function subtitleFor(device: NetworkDevice, brand: BrandEntry | null): string {
  const parts = brand ? [device.hostname, device.ip] : [device.hostname ? device.vendor : null, device.ip];
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

const OCTET_WIDTH = 3;
const NAMELESS_SORTS_LAST = "￿";

/** Named devices sort alphabetically; ones known only by address go last, in numeric address order. */
function sortKey(row: DiscoveryRow): string {
  const paddedIp = row.device.ip.split(".").map((octet) => octet.padStart(OCTET_WIDTH, "0")).join(".");
  const name = row.title === row.device.ip ? NAMELESS_SORTS_LAST : row.title.toLowerCase();
  return `${name}|${paddedIp}`;
}

function actionFor(device: NetworkDevice, brand: BrandEntry | null, added: Device[]): RowAction {
  if (findAddedDevice(device, added)) return "added";
  return brand ? "add" : "identify";
}

/** Builds one row per network device: identified brands first, then everything else; nothing is hidden. */
export function buildDiscoveryRows(devices: NetworkDevice[], added: Device[]): DiscoveryRows {
  const rows = devices.map((device): DiscoveryRow => {
    const brand = device.brand ? getBrand(device.brand) : null;
    return { device, brand, action: actionFor(device, brand, added), title: titleFor(device, brand), subtitle: subtitleFor(device, brand) };
  });
  const bySortKey = (a: DiscoveryRow, b: DiscoveryRow) => (sortKey(a) < sortKey(b) ? -1 : 1);
  return {
    identified: rows.filter((row) => row.brand !== null).sort(bySortKey),
    other: rows.filter((row) => row.brand === null).sort(bySortKey),
  };
}

/** Every row that could still be added, identified ones first (the home "Suggested" list). */
export function notYetAdded(rows: DiscoveryRows): DiscoveryRow[] {
  return [...rows.identified, ...rows.other].filter((row) => row.action !== "added");
}

/** Looks the address up again in a fresh scan; returns the sighting only if it now has a brand. */
export async function reidentify(row: DiscoveryRow, rescan: () => Promise<NetworkDevice[]>): Promise<NetworkDevice | null> {
  const sightings = await rescan();
  const again = sightings.find((candidate) => candidate.ip === row.device.ip);
  return again && again.brand ? again : null;
}
