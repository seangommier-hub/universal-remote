export type ConnectionState = "connected" | "disconnected" | "unknown";

/** Normalized live media-playback state for the `playPause` capability (see Capability.ts) — a
 * shared type so drivers that support it (Roku, LG) agree on the same three values, stored at
 * `values.playbackState`. "stopped" also covers "nothing detected playing" (no foreground media,
 * a transitional/unrecognized state, or a query the TV rejected) — the UI only needs to
 * distinguish "show a pause icon" / "show a play icon" / "fall back to the generic select icon". */
export type PlaybackState = "playing" | "paused" | "stopped";

/**
 * Last-known state for a device. `values` holds capability-specific data (e.g.
 * `{ power: "on", volume: 12 }`) since the shape varies by device category — including, where a
 * driver's `playPause` capability is real (see Capability.ts), `playbackState: "playing" |
 * "paused" | "stopped" | undefined`. Deliberately kept in this loose bag rather than added as a
 * typed top-level field, the same way every other per-capability value already is: DeviceState
 * itself stays generic across every device category, and each consumer reads a value with its own
 * runtime type guard (see UniversalTvRemote.tsx's existing `state.values.power === "on"` etc.).
 */
export interface DeviceState {
  connection: ConnectionState;
  values: Record<string, unknown>;
  lastUpdated: number;
}

/** A state with no known values yet, used before a device has ever reported in. */
export function createUnknownState(): DeviceState {
  return { connection: "unknown", values: {}, lastUpdated: Date.now() };
}
