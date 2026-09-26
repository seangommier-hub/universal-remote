// Countdown for an invite code's short life (ADR-HEARTH-149).

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const PAD_WIDTH = 2;
export const EXPIRED_LABEL = "Expired";

/** Whole seconds left until the invite expires, never negative; 0 when the date is unreadable. */
export function secondsUntilExpiry(expiresAtIso: string, nowMs: number): number {
  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs)) return 0;
  return Math.max(0, Math.ceil((expiresMs - nowMs) / MS_PER_SECOND));
}

/** Formats remaining seconds as m:ss, or "Expired" at zero. */
export function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return EXPIRED_LABEL;
  const minutes = Math.floor(secondsLeft / SECONDS_PER_MINUTE);
  const seconds = String(secondsLeft % SECONDS_PER_MINUTE).padStart(PAD_WIDTH, "0");
  return `${minutes}:${seconds}`;
}
