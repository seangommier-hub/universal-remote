// ADR-HEARTH-218: Sean, directly (2026-10-08): "inputs only need to be shown if they are active."
// The TV reports, per input, whether something is actually plugged into that port (LG's
// getExternalInputList `connected`). The remote only lists inputs that are live, which also frees a
// row of height on a screen that must never scroll (ADR-HEARTH-217).

export interface RemoteInput {
  id: string;
  label: string;
  /** Whether the TV says a device is connected to this input; undefined when the driver can't tell. */
  connected?: boolean;
}

/**
 * The inputs worth showing: every one the TV reports as connected (or doesn't report on), plus the
 * input currently selected even if it reads as unplugged -- so the active source never vanishes
 * from the card. If filtering would leave nothing at all, the full list comes back instead of an
 * empty, dead-looking card.
 */
export function activeInputs(inputs: RemoteInput[], selectedId: string | undefined): RemoteInput[] {
  const visible = inputs.filter((input) => input.connected !== false || input.id === selectedId);
  return visible.length > 0 ? visible : inputs;
}
