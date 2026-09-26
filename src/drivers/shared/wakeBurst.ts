// Fast reconnect right after a Wake-on-LAN packet (ADR-HEARTH-144). A TV that was off takes a
// few seconds to boot, but the normal backoff (2s doubling to 30s) may not retry for up to 30s
// after it is actually up. For a short window this retries on a fixed fast cadence until the
// device answers; if it never does, it hands control back to the driver's normal slow backoff
// (onExhausted) instead of going silent. Attempts never overlap: the next one is only scheduled
// after the previous one settles.

export const WAKE_BURST_INTERVAL_MS = 2000;
export const WAKE_BURST_WINDOW_MS = 60000;

/** Runs at most one fast-retry burst per device id. */
export class WakeBurstController {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** True while a burst is running for this device, so the driver can suppress its slow backoff. */
  isActive(deviceId: string): boolean {
    return this.timers.has(deviceId);
  }

  /** Cancels a running burst without calling onExhausted; a no-op when none is running. */
  stop(deviceId: string): void {
    const timer = this.timers.get(deviceId);
    if (timer) clearTimeout(timer);
    this.timers.delete(deviceId);
  }

  /** Starts (or restarts) a burst: attempt() resolving means the device answered and the burst ends. */
  start(
    deviceId: string,
    attempt: () => Promise<void>,
    onExhausted: () => void,
    intervalMs: number = WAKE_BURST_INTERVAL_MS,
    windowMs: number = WAKE_BURST_WINDOW_MS
  ): void {
    this.stop(deviceId);
    const maxAttempts = Math.max(1, Math.floor(windowMs / intervalMs));
    this.scheduleAttempt(deviceId, 1, maxAttempts, attempt, onExhausted, intervalMs);
  }

  private scheduleAttempt(
    deviceId: string,
    attemptNumber: number,
    maxAttempts: number,
    attempt: () => Promise<void>,
    onExhausted: () => void,
    intervalMs: number
  ): void {
    const timer = setTimeout(async () => {
      let answered = false;
      try {
        await attempt();
        answered = true;
      } catch {
        // an unanswered attempt is the expected case while the device boots; the driver already logged it
      }
      if (this.timers.get(deviceId) !== timer) return;
      if (answered) {
        this.timers.delete(deviceId);
      } else if (attemptNumber >= maxAttempts) {
        this.timers.delete(deviceId);
        onExhausted();
      } else {
        this.scheduleAttempt(deviceId, attemptNumber + 1, maxAttempts, attempt, onExhausted, intervalMs);
      }
    }, intervalMs);
    this.timers.set(deviceId, timer);
  }
}
