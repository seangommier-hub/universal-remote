export type ConnectionState = "connected" | "disconnected" | "unknown";

/** Last-known state for a device. `values` holds capability-specific data (e.g. `{ power: "on", volume: 12 }`) since the shape varies by device category. */
export interface DeviceState {
  connection: ConnectionState;
  values: Record<string, unknown>;
  lastUpdated: number;
}

/** A state with no known values yet, used before a device has ever reported in. */
export function createUnknownState(): DeviceState {
  return { connection: "unknown", values: {}, lastUpdated: Date.now() };
}
