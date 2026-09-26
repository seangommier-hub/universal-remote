// Tracks how long Family Command Center (the Pi and its relay) has been completely unreachable from
// this phone, for the calm offline banner (ADR-HEARTH-172). A single failed request is a blip, so the
// outage only counts once failures span a grace period, and it stops counting when nothing has
// confirmed it recently. In-memory only, like fccConnectivity.

/** Failures must span at least this long before the outage is worth telling anyone about. */
export const FCC_OUTAGE_GRACE_MS = 60 * 1000;
/** A failure this old with no newer attempt is treated as unknown rather than still down. */
export const FCC_OUTAGE_STALE_MS = 3 * 60 * 1000;

let firstFailureAt: number | undefined;
let lastFailureAt: number | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Records that neither the LAN nor the public address answered. */
export function recordFccUnreachable(now: number = Date.now()): void {
  if (firstFailureAt === undefined) firstFailureAt = now;
  lastFailureAt = now;
  notify();
}

/** Records that Family Command Center answered (any HTTP response), ending any outage. */
export function recordFccReached(): void {
  if (firstFailureAt === undefined) return;
  firstFailureAt = undefined;
  lastFailureAt = undefined;
  notify();
}

/** How long the outage has lasted in ms once it is worth reporting, else null (healthy, a short blip, or too stale to trust). */
export function getFccOutageMs(now: number = Date.now()): number | null {
  if (firstFailureAt === undefined || lastFailureAt === undefined) return null;
  if (now - lastFailureAt > FCC_OUTAGE_STALE_MS) return null;
  const duration = lastFailureAt - firstFailureAt;
  return duration >= FCC_OUTAGE_GRACE_MS ? now - firstFailureAt : null;
}

/** Calls back whenever the outage record changes; returns an unsubscribe function. */
export function subscribeFccOutage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only: forgets any recorded outage. */
export function resetFccOutageForTests(): void {
  firstFailureAt = undefined;
  lastFailureAt = undefined;
  listeners.clear();
}
