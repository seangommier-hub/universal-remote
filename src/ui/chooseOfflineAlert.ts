import type { DeviceOutage } from "../core/network/deviceOutageTracker";

// Picks the single offline banner to show, if any (ADR-HEARTH-172): the relay outage first, otherwise the
// device that has been silent longest. Dismissed alerts are skipped until they heal (the caller forgets a
// dismissal once its condition clears).

const MS_PER_MINUTE = 60 * 1000;
const MINUTES_PER_HOUR = 60;
export const FCC_ALERT_KEY = "fcc";

export type OfflineAlert =
  | { kind: "fcc"; key: string; message: string }
  | { kind: "device"; key: string; deviceId: string; message: string };

export interface OfflineAlertInput {
  /** Milliseconds the relay has been down once worth reporting, else null. */
  fccOutageMs: number | null;
  fccConfigured: boolean;
  outages: readonly DeviceOutage[];
  deviceNames: ReadonlyMap<string, string>;
  dismissed: ReadonlySet<string>;
}

/** Plain-language length of a silence: "3 min", "2 h". */
export function formatOutageDuration(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / MS_PER_MINUTE));
  return minutes < MINUTES_PER_HOUR ? `${minutes} min` : `${Math.floor(minutes / MINUTES_PER_HOUR)} h`;
}

/** The one alert to show, or null when everything is healthy, still within its grace period, or dismissed. */
export function chooseOfflineAlert(input: OfflineAlertInput): OfflineAlert | null {
  if (input.fccConfigured && input.fccOutageMs !== null && !input.dismissed.has(FCC_ALERT_KEY)) {
    return { kind: "fcc", key: FCC_ALERT_KEY, message: "Family Command Center isn't answering — remote-from-anywhere is off; retrying" };
  }
  for (const outage of input.outages) {
    const key = `device:${outage.deviceId}`;
    const name = input.deviceNames.get(outage.deviceId);
    if (!name || input.dismissed.has(key)) continue;
    return { kind: "device", key, deviceId: outage.deviceId, message: `${name} hasn't answered for ${formatOutageDuration(outage.silentMs)}` };
  }
  return null;
}
