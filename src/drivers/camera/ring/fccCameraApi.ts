import { CameraView, FccCamerasResponse } from "../../../core/types/Camera";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { SnapshotImage } from "../../../core/types/Snapshot";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";
import { fccFetch } from "../../../core/network/fccRequest";
import { DEFAULT_FETCH_TIMEOUT_MS } from "../../../core/network/fetchWithTimeout";

// Family Command Center's Ring camera integration (ADR-HEARTH-191). The Pi's own contract, fixed
// by its already-shipped implementation (family-command-center commit 651f48d) — this file talks
// to it as documented, it never reshapes the server's own decisions.

export const FCC_CAMERA_DRIVER_ID = "fcc-camera-ring";
export const FCC_CAMERAS_PATH = "/api/cameras";

const HTTP_UNAUTHORIZED = 401;
const NO_CAMERAS: FccCamerasResponse = { enabled: false, cameras: [] };
/** Never actually requested — CameraControls checks `SnapshotImage.placeholder` before ever handing this to an `Image` tag. */
const PLACEHOLDER_SNAPSHOT_URI = "fcc-camera:no-snapshot-yet";

/** Family Command Center reached, but it rejected the saved token — same "hide the feature" outcome as `enabled:false` for every caller here. */
export class FccCameraTokenRejectedError extends Error {}

/**
 * `GET /api/cameras` (ADR-HEARTH-191) — LAN only (`lanOnly`): the Pi 404s this route through the
 * public tunnel by design (it's a household-LAN-only feature), so falling back there would only
 * trade an honest "unreachable" for a confusing 404. Resolves to `{enabled:false, cameras:[]}`
 * with no Family Command Center saved yet, so a caller never needs a separate "not configured"
 * branch just to hide the feature.
 */
export async function fetchFccCameras(signal?: AbortSignal): Promise<FccCamerasResponse> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) return NO_CAMERAS;
  const response = await fccFetch(config, FCC_CAMERAS_PATH, { signal }, DEFAULT_FETCH_TIMEOUT_MS, { lanOnly: true });
  if (response.status === HTTP_UNAUTHORIZED) throw new FccCameraTokenRejectedError("Family Command Center rejected the saved token.");
  if (!response.ok) throw new Error(`Family Command Center returned ${response.status} for the camera list.`);
  return (await response.json()) as FccCamerasResponse;
}

/** A camera entry becomes a read-only `Device` (ADR-HEARTH-191): no capability ids at all, the
 * same rule ADR-HEARTH-182 already applied to Home Assistant cameras — viewing is a read, never a
 * Command, so these are structurally impossible as an Activity/schedule step. `view.id` (a uuid
 * from the Pi) is used directly as the Hearth device id: already globally unique, no prefix needed. */
export function cameraViewToDevice(view: CameraView): Device {
  return {
    id: view.id,
    name: view.name,
    category: "camera",
    manufacturer: "Ring",
    model: view.kind === "doorbell" ? "Doorbell" : "Camera",
    driverId: FCC_CAMERA_DRIVER_ID,
    capabilities: [],
    shared: true,
  };
}

/** A camera entry's live fields, in `DeviceState.values` for `CameraControls`/`EntityControlScreen` to read — same loose bag every other category already uses. */
export function cameraViewToState(view: CameraView): DeviceState {
  return {
    connection: view.availability === "online" ? "connected" : "disconnected",
    values: {
      kind: view.kind,
      powerSource: view.powerSource,
      availability: view.availability,
      streamStatus: view.streamStatus,
      motionActive: view.motionActive,
      lastMotionAt: view.lastMotionAt,
      lastDingAt: view.lastDingAt,
      lastEventType: view.lastEventType,
      lastEventAt: view.lastEventAt,
      batteryLevel: view.batteryLevel,
      snapshotAt: view.snapshotAt,
      snapshotUrl: view.snapshotUrl,
    },
    lastUpdated: Date.now(),
  };
}

/**
 * The image source for a camera's current snapshot (ADR-HEARTH-191) — mirrors
 * `haCameraSnapshot.ts`'s REST-proxy fallback branch exactly: a plain `{uri, headers}` pair, no
 * fetch of the image bytes here. RN's `Image` component makes that request itself, lazily, only
 * when the tile actually renders — this is `GET /api/cameras/<id>/snapshot`, since `snapshotUrl`
 * IS that endpoint's own relative path (the list response and the snapshot endpoint are the same
 * route family, not two independent ones to reconcile). `snapshotUrl: null` (no snapshot captured
 * yet) resolves to a placeholder instead: never a network request, never an error state.
 */
export function fccCameraSnapshotSource(baseUrl: string, token: string, view: Pick<CameraView, "snapshotUrl">): SnapshotImage {
  if (!view.snapshotUrl) return { uri: PLACEHOLDER_SNAPSHOT_URI, placeholder: true };
  return { uri: `${baseUrl}${view.snapshotUrl}`, headers: { Authorization: `Bearer ${token}` } };
}
