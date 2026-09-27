import { cameraViewToDevice, cameraViewToState, fccCameraSnapshotSource, fetchFccCameras, FccCameraTokenRejectedError, FCC_CAMERA_DRIVER_ID } from "./fccCameraApi";
import { CameraView } from "../../../core/types/Camera";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

// Same explicit-factory mock as FamilyCommandCenterDiscoveryProvider.test.ts: the real module
// imports AsyncStorage/SecureStore, whose native modules don't exist in this Jest environment.
jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));

const BASE_URL = "http://192.168.1.172:3210";
const PUBLIC_URL = "https://hearth-relay.example.app";
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

function ok(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe("fetchFccCameras (ADR-HEARTH-191)", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    // A public tunnel is deliberately configured here too, so these tests prove lanOnly actually bypasses it.
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue({ baseUrl: BASE_URL, token: TOKEN, publicBaseUrl: PUBLIC_URL });
  });

  test("parses {enabled, cameras} from the response body", async () => {
    const cameras = [view()];
    (global.fetch as jest.Mock).mockResolvedValueOnce(ok({ enabled: true, cameras }));
    await expect(fetchFccCameras()).resolves.toEqual({ enabled: true, cameras });
  });

  test("sends the bearer header", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(ok({ enabled: true, cameras: [] }));
    await fetchFccCameras();
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  test("never falls back to the public tunnel — only the LAN address is ever called", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(ok({ enabled: true, cameras: [] }));
    await fetchFccCameras();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/cameras`);
  });

  test("resolves to {enabled:false, cameras:[]} with no Family Command Center saved, instead of throwing", async () => {
    (loadFamilyCommandCenterConfig as jest.Mock).mockResolvedValue(null);
    await expect(fetchFccCameras()).resolves.toEqual({ enabled: false, cameras: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("throws FccCameraTokenRejectedError on 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(ok({}, 401));
    await expect(fetchFccCameras()).rejects.toBeInstanceOf(FccCameraTokenRejectedError);
  });

  test("throws a plain error on any other non-OK status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(ok({}, 503));
    await expect(fetchFccCameras()).rejects.toThrow("503");
  });
});

describe("cameraViewToDevice", () => {
  test("maps a camera to a read-only Device with no capability ids", () => {
    const device = cameraViewToDevice(view({ id: "cam-2", name: "Driveway" }));
    expect(device).toMatchObject({ id: "cam-2", name: "Driveway", category: "camera", driverId: FCC_CAMERA_DRIVER_ID, capabilities: [] });
  });

  test("labels a doorbell's model distinctly from a plain camera", () => {
    expect(cameraViewToDevice(view({ kind: "doorbell" })).model).toBe("Doorbell");
    expect(cameraViewToDevice(view({ kind: "camera" })).model).toBe("Camera");
  });
});

describe("cameraViewToState", () => {
  test("maps availability:online to connected, anything else to disconnected", () => {
    expect(cameraViewToState(view({ availability: "online" })).connection).toBe("connected");
    expect(cameraViewToState(view({ availability: "offline" })).connection).toBe("disconnected");
    expect(cameraViewToState(view({ availability: "ring_unavailable" })).connection).toBe("disconnected");
    expect(cameraViewToState(view({ availability: "auth_required" })).connection).toBe("disconnected");
  });

  test("carries every live field into values", () => {
    const cameraView = view({ batteryLevel: 45, lastDingAt: "2026-01-01T00:00:00.000Z", motionActive: true });
    expect(cameraViewToState(cameraView).values).toMatchObject({ batteryLevel: 45, lastDingAt: "2026-01-01T00:00:00.000Z", motionActive: true });
  });
});

describe("fccCameraSnapshotSource", () => {
  test("returns the bearer-headed snapshot URL when one is present", () => {
    expect(fccCameraSnapshotSource(BASE_URL, TOKEN, { snapshotUrl: "/api/cameras/cam-1/snapshot" })).toEqual({
      uri: `${BASE_URL}/api/cameras/cam-1/snapshot`,
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
  });

  test("returns a placeholder, not a network request, when snapshotUrl is null", () => {
    const result = fccCameraSnapshotSource(BASE_URL, TOKEN, { snapshotUrl: null });
    expect(result.placeholder).toBe(true);
    expect(result.headers).toBeUndefined();
  });
});
