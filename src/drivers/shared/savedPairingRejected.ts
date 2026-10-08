import { markNeedsRePair } from "../../core/state/needsRePair";

/**
 * ADR-HEARTH-223: thrown when a device was sent its saved pairing credential and positively
 * answered with a fresh approval prompt instead of accepting it. That is the one failure a re-pair
 * can fix, and the only one that must ever flag a device as needing one: a TV that is off, on
 * another network or simply slow fails differently and never produces this error.
 */
export class SavedPairingRejectedError extends Error {}

/** Marks `values` as needing a re-pair when `error` is a refused saved pairing; any other error leaves the values (and any earlier flag) as they are. */
export function flagRejectedPairing(values: Record<string, unknown>, error: unknown): Record<string, unknown> {
  return error instanceof SavedPairingRejectedError ? markNeedsRePair(values) : values;
}
