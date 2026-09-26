import { DiscoveredDevice } from "../core/discovery/DiscoveryProvider";
import { FccTokenRejectedError, FccUnreachableError } from "../core/network/fccErrors";
import { classifyNetworkFailure, NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { fetchWithTimeout } from "../core/network/fetchWithTimeout";
import { brandForDriverId, BrandId, isBrandId } from "./brandRegistry";
import { DeviceKind, isDeviceKind } from "./deviceKind";
import { FamilyCommandCenterConfig, loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";
import { FamilyCommandCenterDiscoveryProvider, FAMILY_COMMAND_CENTER_DISCOVERY_ID } from "./FamilyCommandCenterDiscoveryProvider";
import { scanAllProvidersWithDiagnostics } from "./scanAllProviders";
import { SsdpDiscoveryProvider } from "./SsdpDiscoveryProvider";

// ADR-HEARTH-148: every device on the network, not just the ones a brand matcher recognized. The
// Family Command Center's /discover/all endpoint does the identification server-side; if it is
// missing (older Pi) or fails, the existing SSDP + inventory scan is the fallback so nothing regresses.

export const DISCOVER_ALL_PATH = "/api/integrations/hearth/discover/all";
const HTTP_NOT_FOUND = 404;
const HTTP_UNAUTHORIZED = 401;

export type DiscoveryConfidence = "certain" | "likely" | "guess" | "unknown";

/** One device seen on the network, identified or not. */
export interface NetworkDevice {
  id: string;
  ip: string;
  mac: string | null;
  hostname: string | null;
  vendor: string | null;
  brand: BrandId | null;
  model: string | null;
  confidence: DiscoveryConfidence;
  evidence: string[];
  online: boolean;
  /** ADR-HEARTH-153: what sort of thing this is; null when the Pi predates the field. */
  kind: DeviceKind | null;
  /** The name a person would call it, when the Pi knows one. */
  friendlyName: string | null;
  /** Household-wide "not a remote device" flag. */
  hidden: boolean;
  /** Household-wide brand override chosen by someone with "It's a ...". */
  labelBrand: BrandId | null;
}

export interface DiscoverAllResult {
  devices: NetworkDevice[];
  /** Set when the Pi could not be reached (never when it is simply not configured). */
  failure: NetworkFailureDiagnosis | null;
  source: "endpoint" | "fallback";
}

/** The endpoint's real response could not be trusted (wrong shape). */
export class DiscoverAllMalformedError extends Error {}
/** This Pi predates the /discover/all endpoint. */
export class DiscoverAllUnavailableError extends Error {}

const CONFIDENCE_RANK: Record<DiscoveryConfidence, number> = { certain: 3, likely: 2, guess: 1, unknown: 0 };
const CONFIDENCE_VALUES = Object.keys(CONFIDENCE_RANK);

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Validates one endpoint row; returns null for rows with no usable IP. */
export function parseNetworkDevice(raw: unknown): NetworkDevice | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const ip = stringOrNull(row.ip);
  if (!ip) return null;
  const brand = isBrandId(row.brand) ? row.brand : null;
  const confidence = CONFIDENCE_VALUES.includes(String(row.confidence)) ? (row.confidence as DiscoveryConfidence) : "unknown";
  return {
    id: stringOrNull(row.id) ?? `net-${ip}`,
    ip,
    mac: stringOrNull(row.mac)?.toLowerCase() ?? null,
    hostname: stringOrNull(row.hostname),
    vendor: stringOrNull(row.vendor),
    brand,
    model: stringOrNull(row.model),
    confidence: brand ? confidence : "unknown",
    evidence: Array.isArray(row.evidence) ? row.evidence.filter((e): e is string => typeof e === "string") : [],
    online: row.online !== false,
    kind: isDeviceKind(row.kind) ? row.kind : null,
    friendlyName: stringOrNull(row.friendlyName),
    hidden: row.hidden === true,
    labelBrand: isBrandId(row.labelBrand) ? row.labelBrand : null,
  };
}

function preferred(a: NetworkDevice, b: NetworkDevice): NetworkDevice {
  const rankDiff = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
  if (rankDiff !== 0) return rankDiff > 0 ? a : b;
  return b.mac && !a.mac ? b : a;
}

function fillGaps(winner: NetworkDevice, other: NetworkDevice): NetworkDevice {
  return {
    ...winner,
    mac: winner.mac ?? other.mac,
    hostname: winner.hostname ?? other.hostname,
    vendor: winner.vendor ?? other.vendor,
    model: winner.model ?? other.model,
    kind: winner.kind ?? other.kind,
    friendlyName: winner.friendlyName ?? other.friendlyName,
    evidence: Array.from(new Set([...winner.evidence, ...other.evidence])),
  };
}

/** Merges lists of sightings into one entry per IP: the most confident identification wins and fills its blanks from the others. */
export function mergeNetworkDevices(...lists: NetworkDevice[][]): NetworkDevice[] {
  const byIp = new Map<string, NetworkDevice>();
  for (const device of lists.flat()) {
    const existing = byIp.get(device.ip);
    if (!existing) {
      byIp.set(device.ip, device);
      continue;
    }
    const winner = preferred(existing, device);
    byIp.set(device.ip, fillGaps(winner, winner === existing ? device : existing));
  }
  return Array.from(byIp.values());
}

/** Converts a legacy provider result (SSDP / inventory) into the same shape the endpoint returns. */
export function networkDeviceFromDiscovered(found: DiscoveredDevice): NetworkDevice | null {
  const ip = stringOrNull(found.metadata?.ipAddress);
  if (!ip) return null;
  const brand = brandForDriverId(found.driverId);
  const hostname = found.name && found.name !== ip ? found.name : null;
  return {
    id: found.id,
    ip,
    mac: stringOrNull(found.metadata?.hwaddr)?.toLowerCase() ?? null,
    hostname,
    vendor: brand ? null : stringOrNull(found.manufacturer) && found.manufacturer !== "Unknown" ? found.manufacturer : null,
    brand: brand?.id ?? null,
    model: null,
    confidence: brand ? "likely" : "unknown",
    evidence: [],
    online: true,
    kind: null,
    friendlyName: null,
    hidden: false,
    labelBrand: null,
  };
}

async function requestAt(baseUrl: string, token: string): Promise<NetworkDevice[]> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${baseUrl}${DISCOVER_ALL_PATH}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new FccUnreachableError(err instanceof Error ? err.message : String(err));
  }
  if (response.status === HTTP_NOT_FOUND) throw new DiscoverAllUnavailableError("Family Command Center has no /discover/all endpoint yet.");
  if (response.status === HTTP_UNAUTHORIZED) throw new FccTokenRejectedError("Family Command Center rejected the saved token.");
  if (!response.ok) throw new Error(`Family Command Center returned ${response.status}.`);
  const body = (await response.json()) as { devices?: unknown };
  if (!Array.isArray(body.devices)) throw new DiscoverAllMalformedError("Family Command Center returned an unexpected discovery response.");
  return body.devices.map(parseNetworkDevice).filter((d): d is NetworkDevice => d !== null);
}

/** Calls the Pi's discover-all endpoint: home address first, public address only when the home one cannot be reached at all. */
export async function fetchDiscoverAll(config: FamilyCommandCenterConfig): Promise<NetworkDevice[]> {
  try {
    return await requestAt(config.baseUrl, config.token);
  } catch (err) {
    if (!(err instanceof FccUnreachableError) || !config.publicBaseUrl) throw err;
    return requestAt(config.publicBaseUrl, config.token);
  }
}

export interface DiscoverAllDependencies {
  loadConfig: () => Promise<FamilyCommandCenterConfig | null>;
  fetchAll: (config: FamilyCommandCenterConfig) => Promise<NetworkDevice[]>;
  fallbackScan: () => Promise<{ devices: NetworkDevice[]; failure: NetworkFailureDiagnosis | null }>;
}

async function legacyScan(): Promise<{ devices: NetworkDevice[]; failure: NetworkFailureDiagnosis | null }> {
  const result = await scanAllProvidersWithDiagnostics([new SsdpDiscoveryProvider(), new FamilyCommandCenterDiscoveryProvider()]);
  const fccFailure = result.failures.find((f) => f.providerId === FAMILY_COMMAND_CENTER_DISCOVERY_ID);
  const failure = fccFailure && fccFailure.diagnosis.kind !== "not-configured" ? fccFailure.diagnosis : null;
  const devices = result.devices.map(networkDeviceFromDiscovered).filter((d): d is NetworkDevice => d !== null);
  return { devices, failure };
}

const DEFAULT_DEPENDENCIES: DiscoverAllDependencies = { loadConfig: loadFamilyCommandCenterConfig, fetchAll: fetchDiscoverAll, fallbackScan: legacyScan };

/** Lists every device on the network via the Pi's discover-all endpoint, falling back to the SSDP + inventory scan; reports an unreachable Pi instead of an empty list. */
export async function discoverAll(deps: DiscoverAllDependencies = DEFAULT_DEPENDENCIES): Promise<DiscoverAllResult> {
  const config = await deps.loadConfig();
  let endpointFailure: NetworkFailureDiagnosis | null = null;
  if (config) {
    try {
      return { devices: await deps.fetchAll(config), failure: null, source: "endpoint" };
    } catch (err) {
      if (!(err instanceof DiscoverAllUnavailableError)) endpointFailure = classifyNetworkFailure(err);
    }
  }
  const fallback = await deps.fallbackScan();
  return { devices: fallback.devices, failure: endpointFailure ?? fallback.failure, source: "fallback" };
}
