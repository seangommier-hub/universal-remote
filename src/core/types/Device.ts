import { CapabilityId } from "./Capability";

/** Broad device categories the product intends to support. Only "tv" has a real driver today; the rest name the taxonomy so later categories slot in without redefining this type. */
export type DeviceCategory =
  | "tv"
  | "streaming"
  | "audio"
  | "lighting"
  | "outlet"
  | "climate"
  | "vacuum"
  | "lock"
  | "gaming"
  // ADR-HEARTH-104: doesn't fit the remote-control metaphor any other category here implies (no
  // directional nav, no volume/power toggle) — surfaced in its own "Feeder" tab, not the Devices
  // list.
  | "feeder"
  | "other";

/** A device the user has paired into their household, independent of which manufacturer or protocol actually controls it. */
export interface Device {
  id: string;
  name: string;
  category: DeviceCategory;
  manufacturer: string;
  model?: string;
  /** Key into the DriverRegistry identifying which driver controls this device. */
  driverId: string;
  /** Capabilities this specific device instance actually supports (a subset of what its driver can theoretically do). */
  capabilities: CapabilityId[];
  roomId?: string;
  /** Driver-specific connection/pairing data (IP address, pre-shared key, auth token, etc). Shape is defined by each driver, not by this generic type. */
  config?: Record<string, unknown>;
}
