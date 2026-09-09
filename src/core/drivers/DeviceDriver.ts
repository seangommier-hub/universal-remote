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

  connect(device: Device): Promise<void>;
  disconnect(device: Device): Promise<void>;

  getState(device: Device): Promise<DeviceState>;
  executeCommand(device: Device, command: Command): Promise<CommandResult>;

  /** Subscribe to state changes for a device. Returns an unsubscribe function. */
  subscribeToState(device: Device, listener: StateChangeListener): () => void;
}
