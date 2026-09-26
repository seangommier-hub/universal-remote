import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { classifyNetworkFailure, NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { Device } from "../core/types/Device";
import { BrandEntry, BrandField, initialCapabilities } from "./brandRegistry";
import { DeviceIdentity, NameSourceKind, resolveDisplayName } from "./deviceIdentity";

// ADR-HEARTH-148: the ONE connect path for adding a device by address — used by the Discover
// screen, the home Suggested list and the generic IP add screen, replacing three copies of the
// same driver.connect / suggested-name / failure-cleanup code.

export interface AddTarget {
  /** Stable id for the saved device (the discovered id, so re-adding the same box dedupes). */
  id: string;
  ipAddress: string;
  hwaddr?: string | null;
  /** Overrides the brand's default name (the generic screen's Name field). */
  name?: string;
  /** Values for the brand's inline fields (Sony PSK, Xbox Live ID). */
  fieldValues?: Record<string, string>;
  /** ADR-HEARTH-156: what discovery already knows, used as lower-precedence name sources. */
  hints?: { friendlyName?: string | null; hostname?: string | null; vendor?: string | null; model?: string | null };
}

export interface AddFlowDependencies {
  driverRegistry: Pick<DriverRegistry, "get">;
  /** A device's own self-reported name, if its driver fetched one at connect time (ADR-HEARTH-085). */
  readReportedName: (deviceId: string) => string | undefined;
  hasFccConfig: () => Promise<boolean>;
  /** ADR-HEARTH-156: asks the Pi who the device at an address is; absent or null means "no answer". */
  identify?: (ipAddress: string) => Promise<DeviceIdentity | null>;
  /** ADR-HEARTH-156: remembers where the saved name came from (typed vs from the device). */
  recordNameSource?: (deviceId: string, source: NameSourceKind) => void;
}

export type AddOutcome =
  | { kind: "added"; device: Device }
  | { kind: "needs-fields"; fields: BrandField[] }
  | { kind: "needs-fcc" }
  | { kind: "custom-screen" }
  | { kind: "failed"; message: string; diagnosis: NetworkFailureDiagnosis | null };

/** The brand's inline fields that have no non-blank value yet. */
export function missingFields(brand: BrandEntry, values: Record<string, string> = {}): BrandField[] {
  return brand.fields.filter((field) => !values[field.key]?.trim());
}

/** Plain-language failure text for an add attempt, classifying network causes instead of echoing driver strings. */
export function describeAddFailure(error: unknown, brand: BrandEntry, ipAddress: string): { message: string; diagnosis: NetworkFailureDiagnosis | null } {
  const diagnosis = classifyNetworkFailure(error);
  if (diagnosis.kind === "lan-blocked") {
    return { message: `Couldn't reach the ${brand.label} at ${ipAddress}. Make sure it's on and on the same Wi-Fi as this phone.`, diagnosis };
  }
  if (diagnosis.kind === "unknown") {
    return { message: `Couldn't add the ${brand.label}: ${diagnosis.message} (${brand.hint})`, diagnosis: null };
  }
  return { message: diagnosis.summary, diagnosis };
}

function buildDevice(brand: BrandEntry, target: AddTarget, capabilities: Device["capabilities"]): Device {
  const config: Record<string, unknown> = { ipAddress: target.ipAddress, hwaddr: target.hwaddr ?? undefined };
  for (const field of brand.fields) config[field.key] = target.fieldValues?.[field.key]?.trim();
  return {
    id: target.id,
    name: target.name?.trim() || brand.defaultName,
    category: brand.category,
    manufacturer: brand.manufacturer,
    driverId: brand.driverId,
    capabilities,
    config,
  };
}

/** Adds what the device said about itself (UUID, serial, MAC, model) and the best name; a typed name always wins (ADR-HEARTH-156). */
function withIdentity(device: Device, brand: BrandEntry, target: AddTarget, reported: string | undefined, identity: DeviceIdentity | null): { device: Device; source: NameSourceKind } {
  const hints = target.hints ?? {};
  const model = identity?.model ?? hints.model ?? undefined;
  const { name, source } = resolveDisplayName({
    userTyped: target.name,
    reported: reported ?? identity?.name,
    friendly: hints.friendlyName,
    hostname: hints.hostname,
    vendor: hints.vendor ?? brand.manufacturer,
    model,
    brandLabel: brand.defaultName,
  });
  const config = device.config ?? {}; // shared with the driver, which keeps updating it (pairing keys)
  if (identity?.uuid) config.uuid = identity.uuid;
  if (identity?.serial) config.serial = identity.serial;
  if (identity?.mac && !config.hwaddr) config.hwaddr = identity.mac;
  return { device: { ...device, name, ...(model ? { model } : {}), config }, source };
}

/** Connects a device of `brand` at an address with defaults, or says exactly what is still needed first. */
export async function connectBrandDevice(deps: AddFlowDependencies, brand: BrandEntry, target: AddTarget): Promise<AddOutcome> {
  if (brand.addMode === "custom-screen") return { kind: "custom-screen" };
  if (brand.needsFcc && !(await deps.hasFccConfig())) return { kind: "needs-fcc" };
  const missing = missingFields(brand, target.fieldValues);
  if (missing.length > 0) return { kind: "needs-fields", fields: missing };

  const driver = deps.driverRegistry.get(brand.driverId);
  if (!driver) return { kind: "failed", message: `The ${brand.label} driver is not available in this build.`, diagnosis: null };

  const device = buildDevice(brand, target, initialCapabilities(brand, driver));
  const identifying = deps.identify ? deps.identify(target.ipAddress).catch(() => null) : Promise.resolve(null);
  try {
    await driver.connect(device);
  } catch (error) {
    // ADR-HEARTH-052: a failed connect leaves the driver's own reconnect loop running against a
    // device that is never saved — stop it, or nothing ever will.
    driver.disconnect(device).catch(() => {});
    return { kind: "failed", ...describeAddFailure(error, brand, target.ipAddress) };
  }
  const reported = deps.readReportedName(device.id)?.trim();
  const identified = withIdentity(device, brand, target, reported, await identifying);
  deps.recordNameSource?.(device.id, identified.source);
  return { kind: "added", device: identified.device };
}
