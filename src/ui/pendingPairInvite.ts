import { PairInvite } from "../discovery/pairInvite";

// Holds a pairing link that arrived (cold start or while running) until the Devices tab can open
// the Join screen with it prefilled. The link is never redeemed here (ADR-HEARTH-160).

type Listener = (invite: PairInvite) => void;

let pending: PairInvite | null = null;
const listeners = new Set<Listener>();

/** Records an incoming pairing link and tells any mounted Devices tab about it. */
export function offerPendingPairInvite(invite: PairInvite): void {
  pending = invite;
  listeners.forEach((listener) => listener(invite));
}

/** Returns the waiting pairing link (once) and clears it, or null when none is waiting. */
export function takePendingPairInvite(): PairInvite | null {
  const invite = pending;
  pending = null;
  return invite;
}

/** Calls back for each pairing link that arrives while subscribed; returns the unsubscribe function. */
export function subscribeToPairInvites(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
