/** Formats the time left on a universal sleep timer as "1 min" / "N min", rounding up to whole minutes. */
export function formatSleepRemaining(expiresAt: number): string {
  const minutes = Math.max(1, Math.ceil((expiresAt - Date.now()) / 60_000));
  return minutes === 1 ? "1 min" : `${minutes} min`;
}
