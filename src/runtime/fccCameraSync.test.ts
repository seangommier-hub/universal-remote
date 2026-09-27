import { planCameraSync, syncFccCameras } from "./fccCameraSync";
import { CameraView, FccCamerasResponse } from "../core/types/Camera";
import { cameraViewToDevice, FCC_CAMERA_DRIVER_ID } from "../drivers/camera/ring/fccCameraApi";
import { Device } from "../core/types/Device";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";

// Same explicit-factory mock as FamilyCommandCenterDiscoveryProvider.test.ts: the real module
// imports AsyncStorage/SecureStore, whose native modules don't exist in this Jest environment.
jest.mock("../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

const BASE_URL = "http://192.168.1.172:3210";

function view(id: string, overrides: Partial<CameraView> = {}): CameraView {
  return {
    id, name: id, kind: "camera", powerSource: "wired", capabilities: ["snapshot"], sortOrder: 1, enabled: true,
    availability: "online", streamStatus: "idle", motionActive: false, lastMotionAt: null, lastDingAt: null,
    lastEventType: null, lastEventAt: null, batteryLevel: null, snapshotAt: null, snapshotUrl: `/api/cameras/${id}/snapshot`,
    ...overrides,
  };
}

function otherDevice(id: string): Device {
  return { id, name: id, category: "tv", manufacturer: "LG", driverId: "lg-webos", capabilities: [] };
}

describe("planCameraSync (ADR-HEARTH-191)", () => {
  test("adds every reported camera not already local", () => {
    const response: FccCamerasResponse = { enabled: true, cameras: [view("cam-1"), view("cam-2")] };
    const plan = planCameraSync(response, []);
    expect(plan.toAdd.map((d) => d.id)).toEqual(["cam-1", "cam-2"]);
    expect(plan.toRemove).toEqual([]);
  });

  test("does not re-add a camera already local", () => {
    const response: FccCamerasResponse = { enabled: true, cameras: [view("cam-1")] };
    const local = [cameraViewToDevice(view("cam-1"))];
    expect(planCameraSync(response, local).toAdd).toEqual([]);
  });

  test("removes a locally synced camera the Pi no longer reports", () => {
    const response: FccCamerasResponse = { enabled: true, cameras: [view("cam-1")] };
    const local = [cameraViewToDevice(view("cam-1")), cameraViewToDevice(view("cam-2"))];
    const plan = planCameraSync(response, local);
    expect(plan.toRemove.map((d) => d.id)).toEqual(["cam-2"]);
  });

  test("never touches a device belonging to a different driver", () => {
    const response: FccCamerasResponse = { enabled: true, cameras: [] };
    const plan = planCameraSync(response, [otherDevice("lg-1")]);
    expect(plan.toRemove).toEqual([]);
  });

  // The exact requirement ADR-HEARTH-191/187 both call out: enabled:false hides every camera,
  // including ones already synced from an earlier, enabled state.
  test("enabled:false removes every synced camera and adds none, regardless of what the Pi's cameras array contains", () => {
    const response: FccCamerasResponse = { enabled: false, cameras: [view("cam-1")] };
    const local = [cameraViewToDevice(view("cam-1"))];
    const plan = planCameraSync(response, local);
    expect(plan.toAdd).toEqual([]);
    expect(plan.toRemove.map((d) => d.id)).toEqual(["cam-1"]);
  });
});

describe("syncFccCameras", () => {
  test("calls addDevice/removeDevice per the plan, and never throws when unreachable", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null); // fetchFccCameras resolves {enabled:false, cameras:[]}
    const addDevice = jest.fn();
    const removeDevice = jest.fn();
    await expect(syncFccCameras([], addDevice, removeDevice)).resolves.toBeUndefined();
    expect(addDevice).not.toHaveBeenCalled();
    expect(removeDevice).not.toHaveBeenCalled();
  });

  test("adds devices reported by a live camera list", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ enabled: true, cameras: [view("cam-1")] }) });
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: BASE_URL, token: "t" });
    const addDevice = jest.fn();
    const removeDevice = jest.fn();
    await syncFccCameras([], addDevice, removeDevice);
    // .mock.calls[0][0], not toHaveBeenCalledWith: toAdd.forEach(addDevice) passes forEach's own
    // (index, array) through as extra arguments too (same pattern autoDeviceSync.ts's own
    // runAutoDeviceSync already uses), which toHaveBeenCalledWith would otherwise flag as a mismatch.
    expect(addDevice.mock.calls[0][0]).toMatchObject({ id: "cam-1", driverId: FCC_CAMERA_DRIVER_ID });
    expect(removeDevice).not.toHaveBeenCalled();
  });
});
