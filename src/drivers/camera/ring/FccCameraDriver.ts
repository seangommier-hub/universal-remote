import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { CameraView } from "../../../core/types/Camera";
import { Device } from "../../../core/types/Device";
import { createUnknownState, DeviceState } from "../../../core/types/DeviceState";
import { SnapshotImage } from "../../../core/types/Snapshot";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";
import { cameraViewToState, fccCameraSnapshotSource, FCC_CAMERA_DRIVER_ID } from "./fccCameraApi";

export { FCC_CAMERA_DRIVER_ID };

/**
 * Read-only driver for Family Command Center's Ring cameras (ADR-HEARTH-191): lists cameras from
 * the Pi as `Device{category:"camera"}` with no capability ids at all — the same rule
 * ADR-HEARTH-182 already applied to Home Assistant cameras, so a Ring camera is structurally
 * impossible as an Activity/schedule step (no id to ever add to `NEVER_IN_ACTIVITY_CAPABILITIES`).
 *
 * `connect`/`disconnect`/`subscribeToState` are deliberately inert: there is no persistent
 * connection to a polled HTTP API, and `App.tsx`'s `stateStoreBridge` wires every device's
 * `connect`/`subscribeToState`/`getState` once at app launch and on every reconnect, for the life
 * of the app — exactly the "background" polling ADR-HEARTH-191 rules out for cameras. The actual
 * 5-second camera-list refresh lives entirely in `useFccCameraPoll.ts`, mount-scoped to a camera
 * screen actually being open, and reaches this driver only through `applyCameraViews` below —
 * this class never calls `fetchFccCameras` itself.
 */
export class FccCameraDriver implements DeviceDriver {
  id = FCC_CAMERA_DRIVER_ID;
  displayName = "Family Command Center Cameras";

  private views = new Map<string, CameraView>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return [];
  }

  async connect(_device: Device): Promise<void> {
    // Nothing to open — a plain polled HTTP API, not a persistent socket.
  }

  async disconnect(_device: Device): Promise<void> {
    // Nothing to close.
  }

  async getState(device: Device): Promise<DeviceState> {
    const view = this.views.get(device.id);
    return view ? cameraViewToState(view) : createUnknownState();
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    // CommandEngine.execute already refuses any command before this is ever reached (an empty
    // `capabilities` list never passes its own `device.capabilities.includes(...)` check) — this
    // exists only to satisfy the DeviceDriver interface honestly, the same defense-in-depth
    // ADR-HEARTH-182 applied to its own read-only categories.
    return {
      success: false,
      deviceId: device.id,
      capability: command.capability,
      timestamp: Date.now(),
      error: { code: "unsupported_capability", message: `${device.name} is read-only.` },
    };
  }

  subscribeToState(device: Device, listener: StateChangeListener): () => void {
    const set = this.listeners.get(device.id) ?? new Set<StateChangeListener>();
    set.add(listener);
    this.listeners.set(device.id, set);
    return () => {
      set.delete(listener);
    };
  }

  /**
   * Applied by `useFccCameraPoll.ts` on every 5-second refresh (and the one-shot startup sync in
   * `fccCameraSync.ts`) — the only way this driver's cached state ever changes. Notifies whatever
   * is currently subscribed to each camera's device id (the bridged `StateStore`, if that device's
   * entity screen is open) so `EntityControlScreen`/`CameraControls` show live availability,
   * battery and last-motion/ding data without this driver ever fetching anything on its own.
   */
  applyCameraViews(views: readonly CameraView[]): void {
    for (const view of views) {
      this.views.set(view.id, view);
      const state = cameraViewToState(view);
      this.listeners.get(view.id)?.forEach((listener) => listener(view.id, state));
    }
  }

  /** The camera's own cached view, or undefined if it hasn't been seen by a poll yet — read by CameraListScreen to render thumbnails/metadata without a second lookup path. */
  cachedView(deviceId: string): CameraView | undefined {
    return this.views.get(deviceId);
  }

  /**
   * Fetches this camera's current snapshot image (ADR-HEARTH-191) — a read, never a Command, never
   * called automatically (see `CameraControls.tsx`). Uses the cached `CameraView` from the last
   * poll rather than fetching the list again itself: `useFccCameraPoll.ts` already keeps it fresh
   * for as long as a camera screen is open, which is the only time this is ever called.
   */
  async fetchSnapshot(device: Device): Promise<SnapshotImage> {
    const config = await loadFamilyCommandCenterConfig();
    if (!config) throw new Error("Family Command Center isn't connected — add its address and token in Settings first.");
    const view = this.views.get(device.id);
    if (!view) throw new Error(`${device.name} isn't reporting in yet.`);
    return fccCameraSnapshotSource(config.baseUrl, config.token, view);
  }
}
