import type { ConnectionState } from "../types/DeviceState";

// Remembers, for each device that was connected this session, when it stopped answering (ADR-HEARTH-172).
// A device that was never connected (app opened while the TV is off) is not an outage, and a wake burst in
// progress is the expected, already-visible way of coming back, so neither is counted.

/** A device must have been silent this long before the banner mentions it; shorter gaps are normal reconnects. */
export const DEVICE_OUTAGE_GRACE_MS = 2 * 60 * 1000;

export interface DeviceOutage {
  deviceId: string;
  silentMs: number;
}

interface Track {
  everConnected: boolean;
  silentSince?: number;
}

/** In-memory per-device outage clock fed by connection-state observations. */
export class DeviceOutageTracker {
  private tracks = new Map<string, Track>();

  /** Feeds one observation of a device's connection state. */
  observe(deviceId: string, connection: ConnectionState, waking: boolean, now: number): void {
    const track = this.tracks.get(deviceId) ?? { everConnected: false };
    this.tracks.set(deviceId, track);
    if (connection === "connected") {
      track.everConnected = true;
      track.silentSince = undefined;
    } else if (waking) {
      track.silentSince = undefined;
    } else if (track.everConnected && track.silentSince === undefined) {
      track.silentSince = now;
    }
  }

  /** Stops tracking devices that are no longer in the household. */
  retainOnly(deviceIds: readonly string[]): void {
    const keep = new Set(deviceIds);
    for (const id of Array.from(this.tracks.keys())) if (!keep.has(id)) this.tracks.delete(id);
  }

  /** Devices silent for at least the grace period, longest silence first. */
  outages(now: number, graceMs: number = DEVICE_OUTAGE_GRACE_MS): DeviceOutage[] {
    const result: DeviceOutage[] = [];
    this.tracks.forEach((track, deviceId) => {
      if (track.silentSince !== undefined && now - track.silentSince >= graceMs) {
        result.push({ deviceId, silentMs: now - track.silentSince });
      }
    });
    return result.sort((a, b) => b.silentMs - a.silentMs);
  }
}
