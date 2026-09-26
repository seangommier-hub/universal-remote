// ADR-HEARTH-167: the wording and timing rules for a scan that is running, so the screen never
// shows a blank wait, and for when a foreground return should re-scan on its own.

export const SLOW_SCAN_MS = 6000;
export const FOREGROUND_RESCAN_MIN_INTERVAL_MS = 15000;

export interface ScanProgressInput {
  /** Devices currently listed (from this scan as it fills in, or the previous scan while a new one runs). */
  foundCount: number;
  /** How long the running scan has been going. */
  elapsedMs: number;
}

/** "Scanning... 7 found so far" while devices are known, a patience note when a first scan drags, plain "Scanning..." otherwise. */
export function scanningText({ foundCount, elapsedMs }: ScanProgressInput): string {
  if (foundCount > 0) return `Scanning... ${foundCount} found so far`;
  if (elapsedMs >= SLOW_SCAN_MS) return "Still looking - this can take a few more seconds";
  return "Scanning...";
}

/** Whether coming back to the app should trigger a scan: not while one runs, and not right after the last one. */
export function shouldRescanOnForeground(input: { scanning: boolean; scannedAt: number | null; now: number; minIntervalMs?: number }): boolean {
  if (input.scanning) return false;
  if (input.scannedAt === null) return true;
  return input.now - input.scannedAt >= (input.minIntervalMs ?? FOREGROUND_RESCAN_MIN_INTERVAL_MS);
}
