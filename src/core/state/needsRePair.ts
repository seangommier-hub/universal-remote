import { DeviceState } from "../types/DeviceState";

// ADR-HEARTH-223: a driver whose device has clearly refused its saved pairing records that in the
// device's state (never in config, so it is never persisted or shared), and every screen reads it
// from here. It clears by itself: a successful connect replaces the whole `values` bag.

/** The `DeviceState.values` key a driver sets when its saved pairing was clearly refused. */
export const NEEDS_RE_PAIR_STATE_KEY = "needsRePair";

/** Returns a copy of `values` marked as needing a re-pair. */
export function markNeedsRePair(values: Record<string, unknown>): Record<string, unknown> {
  return { ...values, [NEEDS_RE_PAIR_STATE_KEY]: true };
}

/** True when the device is not connected and its driver has flagged the saved pairing as refused. */
export function stateNeedsRePair(state: DeviceState): boolean {
  return state.connection !== "connected" && state.values[NEEDS_RE_PAIR_STATE_KEY] === true;
}
