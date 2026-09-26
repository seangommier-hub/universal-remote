import { Device } from "../core/types/Device";
import { AddOutcome, AddTarget } from "./addDeviceFlow";
import { DiscoveryRow } from "./discoveryRows";
import { stepsHeadline } from "./addAllPlan";

// ADR-HEARTH-167: runs "Add all ready" one device at a time (drivers pair through the same Pi and
// sockets, so parallel connects would race), reporting each row's progress and returning a summary.

export type RowRunStatus = "waiting" | "adding" | "added" | "failed" | "needs-step";

export interface RowRunResult {
  status: RowRunStatus;
  /** Plain-language reason for a failure or a step; absent on success. */
  message?: string;
}

export interface AddAllSummary {
  added: Device[];
  failed: Array<{ row: DiscoveryRow; message: string }>;
  needsStep: DiscoveryRow[];
}

export interface AddAllHooks {
  onStatus: (rowId: string, result: RowRunResult) => void;
  /** Registers a connected device without navigating anywhere. */
  onAdded: (device: Device) => void;
}

/** What to connect for a discovered row: its saved id and address plus what discovery already knows as name hints. */
export function addTargetFor(row: DiscoveryRow, fieldValues?: Record<string, string>): AddTarget {
  const { friendlyName, hostname, vendor, model } = row.device;
  return { id: row.device.id, ipAddress: row.device.ip, hwaddr: row.device.mac, fieldValues, hints: { friendlyName, hostname, vendor, model } };
}

const NEEDS_STEP_MESSAGE = "Needs a quick step";
const UNEXPECTED_FAILURE_MESSAGE = "Something went wrong while connecting.";

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : UNEXPECTED_FAILURE_MESSAGE;
}

async function connectSafely(connect: (row: DiscoveryRow) => Promise<AddOutcome>, row: DiscoveryRow): Promise<AddOutcome> {
  try {
    return await connect(row);
  } catch (error) {
    return { kind: "failed", message: messageOf(error), diagnosis: null };
  }
}

/** Connects each row in order, never stopping at a failure; a row that turns out to need input is reported, not lost. */
export async function runAddAll(rows: DiscoveryRow[], connect: (row: DiscoveryRow) => Promise<AddOutcome>, hooks: AddAllHooks): Promise<AddAllSummary> {
  const summary: AddAllSummary = { added: [], failed: [], needsStep: [] };
  rows.forEach((row) => hooks.onStatus(row.device.id, { status: "waiting" }));
  for (const row of rows) {
    hooks.onStatus(row.device.id, { status: "adding" });
    const outcome = await connectSafely(connect, row);
    if (outcome.kind === "added") {
      hooks.onAdded(outcome.device);
      summary.added.push(outcome.device);
      hooks.onStatus(row.device.id, { status: "added" });
    } else if (outcome.kind === "failed") {
      summary.failed.push({ row, message: outcome.message });
      hooks.onStatus(row.device.id, { status: "failed", message: outcome.message });
    } else {
      summary.needsStep.push(row);
      hooks.onStatus(row.device.id, { status: "needs-step", message: NEEDS_STEP_MESSAGE });
    }
  }
  return summary;
}

/** The one-line result: "Added 3 devices · 1 couldn't connect · 2 need a quick step". */
export function describeAddAllSummary(summary: AddAllSummary, queuedSteps: number): string {
  const parts: string[] = [];
  if (summary.added.length > 0) parts.push(`Added ${summary.added.length} ${summary.added.length === 1 ? "device" : "devices"}`);
  if (summary.failed.length > 0) parts.push(`${summary.failed.length} couldn't connect`);
  const stepCount = queuedSteps + summary.needsStep.length;
  if (stepCount > 0) parts.push(stepsHeadline(stepCount));
  return parts.length > 0 ? parts.join(" · ") : "Nothing was added";
}
