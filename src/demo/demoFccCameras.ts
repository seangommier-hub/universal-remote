import type { CameraView } from "../core/types/Camera";
import type { Device } from "../core/types/Device";
import type { SnapshotImage } from "../core/types/Snapshot";
import { cameraViewToDevice, cameraViewToState, fccCameraSnapshotSource } from "../drivers/camera/ring/fccCameraApi";
import { FCC_CAMERA_DRIVER_ID } from "../drivers/camera/ring/FccCameraDriver";
import { DEMO_CAMERA_SNAPSHOT } from "./demoEntityDevices";
import type { DemoDeviceScript } from "./demoHousehold";
import { demoScreenParam } from "./demoMode";

// ADR-HEARTH-191: a fixed 6-camera household for the web verification harness
// (?demo=1&screen=cameras, or ?screen=remote:fcc-camera-<name> for one camera's own entity
// screen), matching the shape of Sean's own live household: one battery doorbell and five wired
// cameras, two of the wired ones with no snapshot captured yet. Joins the demo household only for
// those URLs, so every other scenario's screenshot is unchanged (same pattern as
// demoEntityDevicesForUrl's `remote:ha-*` gating).

const CAMERA_SCREEN_PREFIX = "remote:fcc-camera-";
const CAMERAS_LIST_SCREEN = "cameras";
const FIXED_TIMESTAMP_MS = Date.parse("2026-01-01T12:00:00.000Z");
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

type DemoCameraView = Pick<CameraView, "id" | "name" | "kind" | "powerSource" | "availability"> & Partial<CameraView>;

function view(partial: DemoCameraView): CameraView {
  return {
    capabilities: ["snapshot"],
    sortOrder: 0,
    enabled: true,
    streamStatus: "idle",
    motionActive: false,
    lastMotionAt: null,
    lastDingAt: null,
    lastEventType: null,
    lastEventAt: null,
    batteryLevel: null,
    snapshotAt: null,
    snapshotUrl: `/api/cameras/${partial.id}/snapshot`,
    ...partial,
  };
}

/** The demo household's six Ring cameras (ADR-HEARTH-191) — the exact shape Sean's own household
 * reports: a battery doorbell, five wired cameras, two of those five with no snapshot yet. */
export function demoFccCameraViews(): CameraView[] {
  const fiveMinutesAgo = new Date(FIXED_TIMESTAMP_MS - FIVE_MINUTES_MS).toISOString();
  const twoHoursAgo = new Date(FIXED_TIMESTAMP_MS - TWO_HOURS_MS).toISOString();
  return [
    view({
      id: "fcc-camera-doorbell", name: "Front Doorbell", kind: "doorbell", powerSource: "battery", availability: "online", sortOrder: 1,
      capabilities: ["snapshot", "ding", "battery"], batteryLevel: 45, lastDingAt: fiveMinutesAgo, lastEventType: "ding", lastEventAt: fiveMinutesAgo,
    }),
    view({ id: "fcc-camera-driveway", name: "Driveway Camera", kind: "camera", powerSource: "wired", availability: "online", sortOrder: 2 }),
    view({
      id: "fcc-camera-backyard", name: "Backyard Camera", kind: "camera", powerSource: "wired", availability: "online", sortOrder: 3,
      lastMotionAt: twoHoursAgo, lastEventType: "motion", lastEventAt: twoHoursAgo,
    }),
    view({ id: "fcc-camera-sideyard", name: "Side Yard Camera", kind: "camera", powerSource: "wired", availability: "online", sortOrder: 4, snapshotUrl: null }),
    view({ id: "fcc-camera-garage", name: "Garage Camera", kind: "camera", powerSource: "wired", availability: "offline", sortOrder: 5 }),
    view({ id: "fcc-camera-patio", name: "Patio Camera", kind: "camera", powerSource: "wired", availability: "ring_unavailable", sortOrder: 6, snapshotUrl: null }),
  ];
}

/** Per-device starting state for the demo driver, merged into DEMO_DEVICE_SCRIPTS (demoHousehold.ts) — same shape every other demo script already uses. */
export const DEMO_FCC_CAMERA_SCRIPTS: Record<string, DemoDeviceScript> = Object.fromEntries(
  demoFccCameraViews().map((cameraView) => {
    const state = cameraViewToState(cameraView);
    return [cameraView.id, { reachable: true, connection: state.connection, values: state.values }];
  })
);

/** The demo Ring camera Devices when the URL asks for one of their screens; empty in every other case. */
export function demoFccCameraDevicesForUrl(): Device[] {
  const param = demoScreenParam();
  if (param !== CAMERAS_LIST_SCREEN && !param?.startsWith(CAMERA_SCREEN_PREFIX)) return [];
  return demoFccCameraViews().map(cameraViewToDevice);
}

/** The demo snapshot for a given camera id (ADR-HEARTH-191): the shared 1x1 placeholder pixel for
 * a camera with a `snapshotUrl`, or a real "no snapshot yet" placeholder for the two that have
 * none — proof the harness renders the null-snapshotUrl case as a placeholder, not an error. */
export function demoFccCameraSnapshot(cameraId: string): SnapshotImage {
  const cameraView = demoFccCameraViews().find((candidate) => candidate.id === cameraId);
  if (!cameraView || cameraView.snapshotUrl) return DEMO_CAMERA_SNAPSHOT;
  return fccCameraSnapshotSource("https://demo.invalid", "demo-token", cameraView);
}

/** The demo driver's fetchSnapshot passthrough (demoDriver.ts), routed per-device: a Ring camera
 * gets its own demo snapshot/placeholder, every other camera (Home Assistant) keeps the single
 * shared pixel it always had. */
export function demoSnapshotFor(device: Device): SnapshotImage {
  return device.driverId === FCC_CAMERA_DRIVER_ID ? demoFccCameraSnapshot(device.id) : DEMO_CAMERA_SNAPSHOT;
}
