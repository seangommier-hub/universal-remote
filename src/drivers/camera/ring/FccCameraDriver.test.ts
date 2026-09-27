import { FccCameraDriver } from "./FccCameraDriver";
import { CameraView } from "../../../core/types/Camera";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";
import { Device } from "../../../core/types/Device";

// Same explicit-factory mock as FamilyCommandCenterDiscoveryProvider.test.ts: the real module
// imports AsyncStorage/SecureStore, whose native modules don't exist in this Jest environment.
jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

const BASE_URL = "http://192.168.1.172:3210";
const TOKEN = "shared-token";

function view(overrides: Partial<CameraView> = {}): CameraView {
  return {
    id: "cam-1", name: "Front Porch", kind: "camera", powerSource: "wired", capabilities: ["snapshot"],
    sortOrder: 1, enabled: true, availability: "online", streamStatus: "idle", motionActive: false,
    lastMotionAt: null, lastDingAt: null, lastEventType: null, lastEventAt: null, batteryLevel: null,
    snapshotAt: null, snapshotUrl: "/api/cameras/cam-1/snapshot",
    ...overrides,
  };
}

function device(id = "cam-1"): Device {
  return { id, name: "Front Porch", category: "camera", manufacturer: "Ring", driverId: "fcc-camera-ring", capabilities: [] };
}

describe("FccCameraDriver (ADR-HEARTH-191)", () => {
  test("getCapabilities is always empty — read-only, no dispatchable capability", () => {
    expect(new FccCameraDriver().getCapabilities()).toEqual([]);
  });

  test("executeCommand always refuses — defense in depth behind CommandEngine's own capability check", async () => {
    const driver = new FccCameraDriver();
    const result = await driver.executeCommand(device(), { deviceId: "cam-1", capability: "power" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("unsupported_capability");
  });

  test("connect/disconnect are inert no-ops", async () => {
    const driver = new FccCameraDriver();
    await expect(driver.connect(device())).resolves.toBeUndefined();
    await expect(driver.disconnect(device())).resolves.toBeUndefined();
  });

  test("getState is unknown before any poll has applied a view, then reflects the applied one", async () => {
    const driver = new FccCameraDriver();
    expect((await driver.getState(device())).connection).toBe("unknown");
    driver.applyCameraViews([view({ availability: "online", batteryLevel: 45 })]);
    const state = await driver.getState(device());
    expect(state.connection).toBe("connected");
    expect(state.values.batteryLevel).toBe(45);
  });

  test("applyCameraViews notifies every subscriber for that camera id", () => {
    const driver = new FccCameraDriver();
    const listener = jest.fn();
    driver.subscribeToState(device(), listener);
    driver.applyCameraViews([view({ availability: "offline" })]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBe("cam-1");
    expect(listener.mock.calls[0][1].connection).toBe("disconnected");
  });

  test("subscribeToState's returned unsubscribe stops further notifications", () => {
    const driver = new FccCameraDriver();
    const listener = jest.fn();
    const unsubscribe = driver.subscribeToState(device(), listener);
    unsubscribe();
    driver.applyCameraViews([view()]);
    expect(listener).not.toHaveBeenCalled();
  });

  describe("fetchSnapshot", () => {
    beforeEach(() => {
      (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: BASE_URL, token: TOKEN });
    });

    test("uses the last-applied view's snapshotUrl with the bearer header — no network call of its own", async () => {
      const driver = new FccCameraDriver();
      driver.applyCameraViews([view({ snapshotUrl: "/api/cameras/cam-1/snapshot" })]);
      const image = await driver.fetchSnapshot(device());
      expect(image).toEqual({ uri: `${BASE_URL}/api/cameras/cam-1/snapshot`, headers: { Authorization: `Bearer ${TOKEN}` } });
    });

    test("returns a placeholder for a camera whose cached view has snapshotUrl:null", async () => {
      const driver = new FccCameraDriver();
      driver.applyCameraViews([view({ snapshotUrl: null })]);
      const image = await driver.fetchSnapshot(device());
      expect(image.placeholder).toBe(true);
    });

    test("throws when this camera has never been reported by a poll yet", async () => {
      const driver = new FccCameraDriver();
      await expect(driver.fetchSnapshot(device("never-seen"))).rejects.toThrow();
    });

    test("throws with no Family Command Center saved", async () => {
      (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
      const driver = new FccCameraDriver();
      driver.applyCameraViews([view()]);
      await expect(driver.fetchSnapshot(device())).rejects.toThrow();
    });
  });
});
