// Notices a connection that died silently (ADR-HEARTH-132). A persistent socket that loses its
// peer without a clean close (Wi-Fi handoff, a TV dropping off overnight) never fires "close", so
// the driver keeps reporting "connected" and the user only finds out when a button press hangs.
// Every intervalMs this runs a cheap real request over the live connection; consecutive failures
// declare it dead so the driver's existing reconnect loop takes over.

export const HEARTBEAT_INTERVAL_MS = 8000;
export const HEARTBEAT_FAILURES_BEFORE_DEAD = 2;

/** Starts the heartbeat and returns a function that stops it. onDead fires at most once. */
export function startConnectionHeartbeat(
  check: () => Promise<unknown>,
  onDead: () => void,
  intervalMs: number = HEARTBEAT_INTERVAL_MS
): () => void {
  let consecutiveFailures = 0;
  let stopped = false;
  let checking = false;

  const timer = setInterval(async () => {
    if (stopped || checking) return;
    checking = true;
    try {
      await check();
      consecutiveFailures = 0;
    } catch {
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
