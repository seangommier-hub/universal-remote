import { CapabilityId } from "../types/Capability";
import { Command, CommandResult } from "../types/Command";
import { Device } from "../types/Device";
import { DeviceState } from "../types/DeviceState";
import { MediaBrowseNode } from "../types/MediaBrowse";
import { SnapshotImage } from "../types/Snapshot";

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

  /** Optional cheap proof that this device's existing connection still works right now (ADR-HEARTH-138). Drivers holding a persistent socket implement it so a return to the app does not tear down a healthy connection. Omitted means "unknown, just reconnect". */
  isConnectionAlive?(device: Device): Promise<boolean>;

  /** Optional (ADR-HEARTH-223): forgets the device's saved pairing credential and registers again from scratch, so the device shows its own approval prompt. Resolves once approved, with the new credential stored in `device.config`; on failure the old credential is put back and the error is thrown. Only ever called from an explicit user action, never from a retry loop. A driver that sets `needsRePair` in its state (see needsRePair.ts) must implement it. */
  rePair?(device: Device): Promise<void>;

  connect(device: Device): Promise<void>;
  disconnect(device: Device): Promise<void>;

  getState(device: Device): Promise<DeviceState>;
  executeCommand(device: Device, command: Command): Promise<CommandResult>;

  /** Subscribe to state changes for a device. Returns an unsubscribe function. */
  subscribeToState(device: Device, listener: StateChangeListener): () => void;

  /** Optional (ADR-HEARTH-182): fetches a fresh snapshot image for a camera-category device. Only Home Assistant
   * camera entities implement this today; omitted means the device has no snapshot. Never called automatically —
   * only when the UI's own open/refresh asks for one, so a camera is never polled for imagery in the background. */
  fetchSnapshot?(device: Device): Promise<SnapshotImage>;

  /** Optional (ADR-HEARTH-182): browses one level of a media_player's media tree (Home Assistant's
   * `media_player/browse_media`), the server's own root when both arguments are omitted. Only implemented by
   * drivers whose entity actually declares the "browseMedia" capability. */
  browseMedia?(device: Device, mediaContentId?: string, mediaContentType?: string): Promise<MediaBrowseNode>;
}
