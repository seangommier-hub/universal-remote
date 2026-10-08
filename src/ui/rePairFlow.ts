import { stateNeedsRePair } from "../core/state/needsRePair";
import { DeviceState } from "../core/types/DeviceState";
import { PairingSessionState } from "../discovery/pairingSession";

// ADR-HEARTH-223: which of the re-pair card's views (if any) the remote screen shows. Pure, so the
// whole flow's transitions are tested without rendering anything.
//
//   hidden --(driver flags the saved pairing as refused)--> offer
//   offer --(user taps Re-pair)--> waiting --(TV approves)--> connected --> hidden
//                                     |--(timeout / error)--> failed --(Try again)--> waiting
//   waiting / failed --(Cancel)--> offer (still flagged) or hidden

export type RePairView = "hidden" | "offer" | "waiting" | "failed" | "connected";

export interface RePairViewInput {
  /** Whether the device's driver can re-pair at all (and the person is allowed to start one). */
  canRePair: boolean;
  state: DeviceState;
  /** The pairing session that runs the user-started re-pair. */
  session: PairingSessionState;
}

/** The re-pair card's current view; a running or just-finished re-pair always wins over the offer. */
export function rePairView({ canRePair, state, session }: RePairViewInput): RePairView {
  if (!canRePair) return "hidden";
  if (session.phase === "waiting") return "waiting";
  if (session.phase === "failed") return "failed";
  if (session.phase === "connected") return "connected";
  return stateNeedsRePair(state) ? "offer" : "hidden";
}
