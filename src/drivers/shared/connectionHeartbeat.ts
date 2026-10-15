// Notices a connection that died silently (ADR-HEARTH-132). A persistent socket that loses its
// peer without a clean close (Wi-Fi handoff, a TV dropping off overnight) never fires "close", so
// the driver keeps reporting "connected" and the user only finds out when a button press hangs.
// Every intervalMs this runs a cheap real request over the live connection; consecutive failures
// declare it dead so the driver's existing reconnect loop takes over.

export const HEARTBEAT_INTERVAL_MS = 8000;
export const HEARTBEAT_FAILURES_BEFORE_DEAD = 2;

/**
 * Starts the heartbeat and returns a function that stops it. onDead fires at most once.
 *
 * `graceMs` (ADR-HEARTH-229): a freshly-connected TV waking from deep standby can answer the
 * initial pairing handshake before every one of its own subsystems is actually up -- real-hardware
 * finding, 2026-10-15: an LG woken by Wake-on-LAN connected, then had its heartbeat's own
 * ssap://audio/getVolume probe (the liveness check) fail for its first several seconds while the
 * TV was still finishing booting, tearing the brand-new connection down as "dead" before it had a
 * real chance to settle. During the grace window a failure is tolerated (not counted) rather than
 * treated as a sign the connection actually died; a success any time still resets the count
 * immediately, same as always. Defaults to 0 (no grace, today's exact prior behavior) for any
 * caller that doesn't pass one.
 */
export function startConnectionHeartbeat(
  check: () => Promise<unknown>,
  onDead: () => void,
  intervalMs: number = HEARTBEAT_INTERVAL_MS,
  graceMs: number = 0
): () => void {
  let consecutiveFailures = 0;
  let stopped = false;
  let checking = false;
  const startedAt = Date.now();

  const timer = setInterval(async () => {
    if (stopped || checking) return;
    checking = true;
    try {
      await check();
      consecutiveFailures = 0;
    } catch {
      if (Date.now() - startedAt < graceMs) return; // still within the post-connect settle window -- not counted
      consecutiveFailures += 1;
      if (consecutiveFailures >= HEARTBEAT_FAILURES_BEFORE_DEAD && !stopped) {
        stopped = true;
        clearInterval(timer);
        onDead();
      }
    } finally {
      checking = false;
    }
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
