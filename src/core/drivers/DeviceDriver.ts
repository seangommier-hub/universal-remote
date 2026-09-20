import { CapabilityId } from "../types/Capability";
import { Command, CommandResult } from "../types/Command";
import { Device } from "../types/Device";
import { DeviceState } from "../types/DeviceState";

/** A callback a driver invokes whenever it learns a device's state changed, whether from a command it issued or a push update from the device itself. */
export type StateChangeListener = (deviceId: string, state: DeviceState) => void;

/**
 * Implemented once per manufacturer/protocol. The rest of the app only ever talks to this
 * interface, never to a manufacturer SDK directly — that isolation is what lets a Roomba
 * problem stay a Roomba problem instead of breaking Samsung TVs.
 */
export interface DeviceDriver {
  id: string;
  displayName: string;

  /** Capabilities this driver can ever support, across all device models it drives. A specific Device may support a subset. */
  getCapabilities(): CapabilityId[];

  /** True for a driver whose per-Device `capabilities` are taught/learned rather than a fixed
   * function of the driver alone (BroadlinkIrDriver, ADR-HEARTH-103) — a Device's own `capabilities`
   * field is the source of truth for what's actually been taught, and must never be overwritten
   * with `getCapabilities()`'s full teachable superset. Callers that otherwise resync a persisted
   * device's capabilities against its driver (App.tsx's refreshCapabilities) must skip that for
   * any driver where this is true. Omitted/undefined is treated as false — every existing driver's
   * behavior is unchanged by this field's addition. */
  hasDynamicCapabilities?: boolean;

  connect(device: Device): Promise<void>;
  disconnect(device: Device): Promise<void>;

  getState(device: Device): Promise<DeviceState>;
  executeCommand(device: Device, command: Command): Promise<CommandResult>;

  /** Subscribe to state changes for a device. Returns an unsubscribe function. */
  subscribeToState(device: Device, listener: StateChangeListener): () => void;
}
