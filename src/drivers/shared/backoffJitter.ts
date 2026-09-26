// Spreads reconnect retries apart (ADR-HEARTH-144). Every driver backs off 2s, 4s, 8s... and a
// power blip or router restart drops many devices at the same instant, so without jitter they all
// retry on the same tick and hit the network (and the Family Command Center) as one burst.

export const BACKOFF_JITTER_FRACTION = 0.2;

/** Adds up to BACKOFF_JITTER_FRACTION of extra delay; random must return a value in [0, 1). */
export function withBackoffJitter(delayMs: number, random: () => number = Math.random): number {
  return Math.round(delayMs * (1 + BACKOFF_JITTER_FRACTION * random()));
}
