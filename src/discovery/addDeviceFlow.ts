import { DriverRegistry } from "../core/drivers/DriverRegistry";
import { classifyNetworkFailure, NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { Device } from "../core/types/Device";
import { BrandEntry, BrandField, initialCapabilities } from "./brandRegistry";
import { describePairingFailure } from "./pairingCopy";

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
}

export interface AddFlowDependencies {
  driverRegistry: Pick<DriverRegistry, "get">;
  /** A device's own self-reported name, if its driver fetched one at connect time (ADR-HEARTH-085). */
  readReportedName: (deviceId: string) => string | undefined;
  hasFccConfig: () => Promise<boolean>;
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
  const pairing = describePairingFailure(brand.id, brand.label, error);
  if (pairing.kind !== "unknown" && pairing.kind !== "unreachable") return { message: pairing.message, diagnosis: null };
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

/** Connects a device of `brand` at an address with defaults, or says exactly what is still needed first. */
export async function connectBrandDevice(deps: AddFlowDependencies, brand: BrandEntry, target: AddTarget): Promise<AddOutcome> {
  if (brand.addMode === "custom-screen") return { kind: "custom-screen" };
  if (brand.needsFcc && !(await deps.hasFccConfig())) return { kind: "needs-fcc" };
  const missing = missingFields(brand, target.fieldValues);
  if (missing.length > 0) return { kind: "needs-fields", fields: missing };

  const driver = deps.driverRegistry.get(brand.driverId);
  if (!driver) return { kind: "failed", message: `The ${brand.label} driver is not available in this build.`, diagnosis: null };

  const device = buildDevice(brand, target, initialCapabilities(brand, driver));
  try {
    await driver.connect(device);
  } catch (error) {
    // ADR-HEARTH-052: a failed connect leaves the driver's own reconnect loop running against a
    // device that is never saved — stop it, or nothing ever will.
    driver.disconnect(device).catch(() => {});
    return { kind: "failed", ...describeAddFailure(error, brand, target.ipAddress) };
  }
  const reported = deps.readReportedName(device.id)?.trim();
  return { kind: "added", device: reported && !target.name ? { ...device, name: reported } : device };
}

/** The add attempt failed; carries the plain-language message and any network diagnosis for the screen. */
export class AddFlowFailedError extends Error {
  constructor(message: string, readonly diagnosis: NetworkFailureDiagnosis | null) {
    super(message);
  }
}

/** The add attempt cannot start until Family Command Center is set up. */
export class AddFlowNeedsFccError extends Error {}

/** Connects a brand at an address and resolves to the device, throwing AddFlowFailedError / AddFlowNeedsFccError otherwise — the shape a pairing session's run() needs. */
export async function connectBrandDeviceOrThrow(deps: AddFlowDependencies, brand: BrandEntry, target: AddTarget): Promise<Device> {
  const outcome = await connectBrandDevice(deps, brand, target);
  if (outcome.kind === "added") return outcome.device;
  if (outcome.kind === "needs-fcc") throw new AddFlowNeedsFccError("Family Command Center is required.");
  if (outcome.kind === "failed") throw new AddFlowFailedError(outcome.message, outcome.diagnosis);
  throw new Error(`The ${brand.label} needs more information before it can connect.`);
}
