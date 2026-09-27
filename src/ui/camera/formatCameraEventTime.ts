const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * A short "how long ago" label for a camera event timestamp (ADR-HEARTH-191): "just now", "5m
 * ago", "3h ago", "2d ago". Pure function of `now` (defaults to the real clock) so it stays
 * deterministic in tests and in the demo/web verification harness, which never advances a real
 * clock. Null for a missing or unparseable timestamp — callers simply don't render a row for it.
 */
export function formatCameraEventTime(isoTimestamp: string | null, now: number = Date.now()): string | null {
  if (!isoTimestamp) return null;
  const then = Date.parse(isoTimestamp);
  if (Number.isNaN(then)) return null;
  const deltaMs = Math.max(0, now - then);
  if (deltaMs < MINUTE_MS) return "just now";
  if (deltaMs < HOUR_MS) return `${Math.floor(deltaMs / MINUTE_MS)}m ago`;
  if (deltaMs < DAY_MS) return `${Math.floor(deltaMs / HOUR_MS)}h ago`;
  return `${Math.floor(deltaMs / DAY_MS)}d ago`;
}
