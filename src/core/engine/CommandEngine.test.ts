import { CommandEngine } from "./CommandEngine";
import { DeviceDriver } from "../drivers/DeviceDriver";
import { DeviceRegistry } from "../registry/DeviceRegistry";
import { DriverRegistry } from "../drivers/DriverRegistry";
import { StateStore } from "../state/StateStore";
import { mockSamsungTvDriver } from "../../drivers/tv/samsung/MockSamsungTvDriver";
import { Device } from "../types/Device";

function buildEngine() {
  const deviceRegistry = new DeviceRegistry();
  const driverRegistry = new DriverRegistry();
  const stateStore = new StateStore();
  driverRegistry.register(mockSamsungTvDriver);
  const engine = new CommandEngine(deviceRegistry, driverRegistry, stateStore);
  return { deviceRegistry, driverRegistry, stateStore, engine };
}

const livingRoomTv: Device = {
  id: "tv-1",
  name: "Living Room Samsung TV",
  category: "tv",
  manufacturer: "Samsung",
  driverId: "mock-samsung-tv",
  capabilities: ["power", "volumeUp", "channelUp"],
};

describe("CommandEngine", () => {
  test("dispatches a supported capability to the driver and updates the state store", async () => {
    const { deviceRegistry, stateStore, engine } = buildEngine();
    deviceRegistry.add(livingRoomTv);

    const result = await engine.execute({ deviceId: "tv-1", capability: "power" });

    expect(result.success).toBe(true);
    expect(stateStore.get("tv-1").values.power).toBe("on");
  });

  test("fails with device_not_found for an unregistered device", async () => {
    const { engine } = buildEngine();

    const result = await engine.execute({ deviceId: "missing", capability: "power" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("device_not_found");
  });

  test("fails with unsupported_capability when the device does not declare it", async () => {
    const { deviceRegistry, engine } = buildEngine();
    deviceRegistry.add(livingRoomTv);

    const result = await engine.execute({ deviceId: "tv-1", capability: "mute" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("unsupported_capability");
  });

  test("fails with driver_not_found when the device points at an unregistered driver", async () => {
    const { deviceRegistry, engine } = buildEngine();
    deviceRegistry.add({ ...livingRoomTv, driverId: "does-not-exist" });

    const result = await engine.execute({ deviceId: "tv-1", capability: "power" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("driver_not_found");
  });

  test("converts a driver exception into a driver_error result instead of throwing", async () => {
    const { deviceRegistry, driverRegistry, engine } = buildEngine();
    deviceRegistry.add({ ...livingRoomTv, capabilities: ["setVolume"] });
    // setVolume requires a numeric 'volume' arg; omitting it makes the driver throw.
    driverRegistry.get("mock-samsung-tv");

    const result = await engine.execute({ deviceId: "tv-1", capability: "setVolume" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("driver_error");
  });

  describe("outcome observer (ADR-HEARTH-170)", () => {
    test("is told about a success and a failure for a known device", async () => {
      const { deviceRegistry, engine } = buildEngine();
      deviceRegistry.add({ ...livingRoomTv, capabilities: ["power", "setVolume"] });
      const seen: boolean[] = [];
      engine.setOutcomeObserver((_command, device, result) => seen.push(result.success && device.id === "tv-1"));

      await engine.execute({ deviceId: "tv-1", capability: "power" });
      await engine.execute({ deviceId: "tv-1", capability: "setVolume" });

      expect(seen).toEqual([true, false]);
    });

    test("is skipped for silent commands and for devices that do not exist", async () => {
      const { deviceRegistry, engine } = buildEngine();
      deviceRegistry.add(livingRoomTv);
      const observer = jest.fn();
      engine.setOutcomeObserver(observer);

      await engine.execute({ deviceId: "tv-1", capability: "power" }, { silent: true });
      await engine.execute({ deviceId: "missing", capability: "power" });

      expect(observer).not.toHaveBeenCalled();
    });

    test("an observer that throws never changes the command result", async () => {
      const { deviceRegistry, engine } = buildEngine();
      deviceRegistry.add(livingRoomTv);
      engine.setOutcomeObserver(() => {
        throw new Error("boom");
      });

      const result = await engine.execute({ deviceId: "tv-1", capability: "power" });

      expect(result.success).toBe(true);
    });
  });

  describe("fetchSnapshot (ADR-HEARTH-182)", () => {
    const camera: Device = { id: "cam-1", name: "Porch Camera", category: "camera", manufacturer: "Home Assistant", driverId: "fake-camera", capabilities: [] };

    function registerCameraDriver(driverRegistry: DriverRegistry, fetchSnapshot: DeviceDriver["fetchSnapshot"]) {
      driverRegistry.register({
        id: "fake-camera",
        displayName: "Fake Camera",
        getCapabilities: () => [],
        connect: async () => undefined,
        disconnect: async () => undefined,
        getState: async () => ({ connection: "connected", values: {}, lastUpdated: 0 }),
        executeCommand: async () => ({ success: true, deviceId: "cam-1", capability: "power", timestamp: 0 }),
        subscribeToState: () => () => undefined,
        fetchSnapshot,
      });
    }

    test("returns the driver's snapshot image", async () => {
      const { deviceRegistry, driverRegistry, engine } = buildEngine();
      registerCameraDriver(driverRegistry, async () => ({ uri: "http://ha.test/api/camera_proxy/camera.porch", headers: { Authorization: "Bearer t" } }));
      deviceRegistry.add(camera);

      const result = await engine.fetchSnapshot("cam-1");

      expect(result).toEqual({ success: true, image: { uri: "http://ha.test/api/camera_proxy/camera.porch", headers: { Authorization: "Bearer t" } } });
    });

    test("fails gracefully for an unknown device, and for a driver with no fetchSnapshot", async () => {
      const { deviceRegistry, driverRegistry, engine } = buildEngine();
      driverRegistry.register(mockSamsungTvDriver);
      deviceRegistry.add({ ...camera, driverId: "mock-samsung-tv" });

      expect((await engine.fetchSnapshot("missing")).success).toBe(false);
      expect((await engine.fetchSnapshot("cam-1")).success).toBe(false);
    });

    test("a thrown fetch is reported, never thrown to the caller", async () => {
      const { deviceRegistry, driverRegistry, engine } = buildEngine();
      registerCameraDriver(driverRegistry, async () => {
        throw new Error("camera unreachable");
      });
      deviceRegistry.add(camera);

      const result = await engine.fetchSnapshot("cam-1");

      expect(result).toEqual({ success: false, error: "camera unreachable" });
    });
  });

  describe("browseMedia (ADR-HEARTH-182)", () => {
    const speaker: Device = { id: "spk-1", name: "Speaker", category: "streaming", manufacturer: "Home Assistant", driverId: "fake-speaker", capabilities: ["browseMedia", "playMedia"] };
    const node = { title: "Speaker", mediaContentId: "", mediaContentType: "", canPlay: false, canExpand: true, children: [] };

    function registerSpeakerDriver(driverRegistry: DriverRegistry, browseMedia: DeviceDriver["browseMedia"]) {
      driverRegistry.register({
        id: "fake-speaker",
        displayName: "Fake Speaker",
        getCapabilities: () => ["browseMedia", "playMedia"],
        connect: async () => undefined,
        disconnect: async () => undefined,
        getState: async () => ({ connection: "connected", values: {}, lastUpdated: 0 }),
        executeCommand: async () => ({ success: true, deviceId: "spk-1", capability: "playMedia", timestamp: 0 }),
        subscribeToState: () => () => undefined,
        browseMedia,
      });
    }

    test("returns the driver's browsed node", async () => {
      const { deviceRegistry, driverRegistry, engine } = buildEngine();
      registerSpeakerDriver(driverRegistry, async () => node);
      deviceRegistry.add(speaker);

      const result = await engine.browseMedia("spk-1", "folder-1", "directory");

      expect(result).toEqual({ success: true, node });
    });

    test("refuses a device that does not declare browseMedia even if its driver implements it", async () => {
      const { deviceRegistry, driverRegistry, engine } = buildEngine();
      registerSpeakerDriver(driverRegistry, async () => node);
      deviceRegistry.add({ ...speaker, capabilities: ["playMedia"] });

      expect((await engine.browseMedia("spk-1")).success).toBe(false);
    });
  });
});
