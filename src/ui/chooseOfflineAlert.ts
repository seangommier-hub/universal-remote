import type { DeviceOutage } from "../core/network/deviceOutageTracker";
// Picks the single offline banner to show, if any (ADR-HEARTH-172): the relay outage first, otherwise the
// device that has been silent longest. Dismissed alerts are skipped until they heal (the caller forgets a
// dismissal once its condition clears).

const MS_PER_MINUTE = 60 * 1000;
const MINUTES_PER_HOUR = 60;
export const FCC_ALERT_KEY = "fcc";

export type OfflineAlert =
  | { kind: "fcc"; key: string; message: string }
  | { kind: "device"; key: string; deviceId: string; message: string; needsRePair: boolean };

export interface OfflineAlertInput {
  /** Milliseconds the relay has been down once worth reporting, else null. */
  fccOutageMs: number | null;
  fccConfigured: boolean;
  outages: readonly DeviceOutage[];
  deviceNames: ReadonlyMap<string, string>;
  dismissed: ReadonlySet<string>;
  /** Devices whose driver has flagged their saved pairing as refused (ADR-HEARTH-223); their alert asks for a re-pair instead of just reporting silence. */
  rePairDeviceIds?: ReadonlySet<string>;
}

/** Plain-language length of a silence: "3 min", "2 h". */
export function formatOutageDuration(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / MS_PER_MINUTE));
  return minutes < MINUTES_PER_HOUR ? `${minutes} min` : `${Math.floor(minutes / MINUTES_PER_HOUR)} h`;
}

/**
 * ADR-HEARTH-223: a device whose saved pairing was refused is worth an alert even though the outage
 * tracker never counts it (it has typically never connected this session, which is exactly why the
 * pairing was found refused), so each flagged device without an outage record is added after the real ones.
 */
function withFlaggedDevices(input: OfflineAlertInput): DeviceOutage[] {
  const alreadyListed = new Set(input.outages.map((outage) => outage.deviceId));
  const flagged = Array.from(input.rePairDeviceIds ?? []).filter((deviceId) => !alreadyListed.has(deviceId));
  return [...input.outages, ...flagged.map((deviceId) => ({ deviceId, silentMs: 0 }))];
}

/** The one alert to show, or null when everything is healthy, still within its grace period, or dismissed. */
export function chooseOfflineAlert(input: OfflineAlertInput): OfflineAlert | null {
  if (input.fccConfigured && input.fccOutageMs !== null && !input.dismissed.has(FCC_ALERT_KEY)) {
    return { kind: "fcc", key: FCC_ALERT_KEY, message: "Family Command Center isn't answering — remote-from-anywhere is off; retrying" };
  }
  for (const outage of withFlaggedDevices(input)) {
    const key = `device:${outage.deviceId}`;
    const name = input.deviceNames.get(outage.deviceId);
    if (!name || input.dismissed.has(key)) continue;
    const needsRePair = input.rePairDeviceIds?.has(outage.deviceId) ?? false;
    const message = needsRePair ? `${name} needs to be re-paired — it no longer accepts Hearth's saved pairing` : `${name} hasn't answered for ${formatOutageDuration(outage.silentMs)}`;
    return { kind: "device", key, deviceId: outage.deviceId, message, needsRePair };
  }
  return null;
}
