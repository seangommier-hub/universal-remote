import { startFccCameraPolling, FCC_CAMERA_POLL_INTERVAL_MS, FccCameraPollDeps } from "./useFccCameraPoll";
import { FccCameraDriver } from "../../drivers/camera/ring/FccCameraDriver";
import { CameraView } from "../../core/types/Camera";

// Same rationale as useKeepScreenAwake.test.ts: the mount/unmount wiring itself is a single,
// standard useEffect (useFccCameraPoll) and isn't independently testable without the React
// rendering infra this project doesn't otherwise use for hooks — startFccCameraPolling is the real
// logic (immediate poll, 5s cadence, stop really stops it) and is exercised directly here.

function view(id: string): CameraView {
  return {
    id, name: id, kind: "camera", powerSource: "wired", capabilities: ["snapshot"], sortOrder: 1, enabled: true,
    availability: "online", streamStatus: "idle", motionActive: false, lastMotionAt: null, lastDingAt: null,
    lastEventType: null, lastEventAt: null, batteryLevel: null, snapshotAt: null, snapshotUrl: `/api/cameras/${id}/snapshot`,
  };
}

function fakeDeps(fetchCameras: jest.Mock): FccCameraPollDeps {
  return { fetchCameras, intervalMs: FCC_CAMERA_POLL_INTERVAL_MS, setIntervalFn: setInterval, clearIntervalFn: clearInterval };
}

describe("startFccCameraPolling (ADR-HEARTH-191)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("polls immediately, applying the response to the driver", async () => {
    const driver = new FccCameraDriver();
    const applySpy = jest.spyOn(driver, "applyCameraViews");
    const cameras = [view("cam-1")];
    const fetchCameras = jest.fn().mockResolvedValue({ enabled: true, cameras });
    startFccCameraPolling(driver, fakeDeps(fetchCameras));
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchCameras).toHaveBeenCalledTimes(1);
    expect(applySpy).toHaveBeenCalledWith(cameras);
  });

  test("polls again every 5 seconds while running", async () => {
    const driver = new FccCameraDriver();
    const fetchCameras = jest.fn().mockResolvedValue({ enabled: true, cameras: [] });
    startFccCameraPolling(driver, fakeDeps(fetchCameras));
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchCameras).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(FCC_CAMERA_POLL_INTERVAL_MS);
    expect(fetchCameras).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(FCC_CAMERA_POLL_INTERVAL_MS);
    expect(fetchCameras).toHaveBeenCalledTimes(3);
  });

  test("stop() ends the 5-second refresh — no polling after unmount", async () => {
    const driver = new FccCameraDriver();
    const fetchCameras = jest.fn().mockResolvedValue({ enabled: true, cameras: [] });
    const stop = startFccCameraPolling(driver, fakeDeps(fetchCameras));
    await Promise.resolve();
    await Promise.resolve();
    stop();
    await jest.advanceTimersByTimeAsync(FCC_CAMERA_POLL_INTERVAL_MS * 4);
    expect(fetchCameras).toHaveBeenCalledTimes(1); // only the immediate poll before stop() ever ran
  });

  test("a rejected refresh is caught, logged, and does not stop the next tick from happening", async () => {
    const driver = new FccCameraDriver();
    const fetchCameras = jest.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue({ enabled: true, cameras: [] });
    startFccCameraPolling(driver, fakeDeps(fetchCameras));
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchCameras).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(FCC_CAMERA_POLL_INTERVAL_MS);
    expect(fetchCameras).toHaveBeenCalledTimes(2);
  });
});
