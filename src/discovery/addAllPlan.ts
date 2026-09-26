import { pairingPromptFor } from "./pairingCopy";
import { DiscoveryRow } from "./discoveryRows";

// ADR-HEARTH-167: which recognized devices "Add all ready" can connect without the person doing
// anything, and which need a quick step first (an on-screen approval, a key, a guided pairing).
// Pure, so the split is tested instead of buried in the screen.

export type StepReason = "approve-on-device" | "enter-key" | "guided-pairing" | "needs-fcc";

export interface StepItem {
  row: DiscoveryRow;
  reason: StepReason;
  /** One short sentence saying what the person has to do. */
  instruction: string;
}

export interface AddAllPlan {
  /** Recognized, online devices that connect with no input. */
  auto: DiscoveryRow[];
  /** Recognized, online devices that need one quick step first. */
  steps: StepItem[];
}

/** Brands whose connect waits for the person to accept a prompt on the device itself. */
const APPROVAL_BRAND_IDS: ReadonlySet<string> = new Set(["lg", "samsung"]);

const NEEDS_FCC_INSTRUCTION = "Set up Family Command Center first";
const ENTER_KEY_INSTRUCTION = "Type the key shown in the device's settings";
const GUIDED_INSTRUCTION_FALLBACK = "Follow the short pairing steps";
const APPROVE_INSTRUCTION_FALLBACK = "Accept the prompt on the device";

function stepReasonFor(row: DiscoveryRow, fccConfigured: boolean): StepReason | null {
  const brand = row.brand;
  if (!brand) return null;
  if (brand.needsFcc && !fccConfigured) return "needs-fcc";
  if (brand.addMode === "custom-screen") return "guided-pairing";
  if (brand.addMode === "inline-fields") return "enter-key";
  return APPROVAL_BRAND_IDS.has(brand.id) ? "approve-on-device" : null;
}

function instructionFor(row: DiscoveryRow, reason: StepReason): string {
  const hint = row.brand ? pairingPromptFor(row.brand.id)?.instruction : undefined;
  if (reason === "needs-fcc") return NEEDS_FCC_INSTRUCTION;
  if (reason === "enter-key") return ENTER_KEY_INSTRUCTION;
  if (reason === "guided-pairing") return hint ?? GUIDED_INSTRUCTION_FALLBACK;
  return hint ?? APPROVE_INSTRUCTION_FALLBACK;
}

/** True for a row Add-all should consider: recognized, on, not yet added and not hidden. */
export function isBulkCandidate(row: DiscoveryRow): boolean {
  return row.action === "add" && row.brand !== null && row.online && !row.hidden;
}

/** Splits the ready rows into what connects on its own and what needs a quick step. */
export function planAddAll(rows: DiscoveryRow[], fccConfigured: boolean): AddAllPlan {
  const plan: AddAllPlan = { auto: [], steps: [] };
  for (const row of rows.filter(isBulkCandidate)) {
    const reason = stepReasonFor(row, fccConfigured);
    if (reason) plan.steps.push({ row, reason, instruction: instructionFor(row, reason) });
    else plan.auto.push(row);
  }
  return plan;
}

/** "2 need a quick step" style headline for the checklist card. */
export function stepsHeadline(count: number): string {
  return count === 1 ? "1 needs a quick step" : `${count} need a quick step`;
}
