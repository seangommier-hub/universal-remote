import { cameraSnapshotSource } from "./haCameraSnapshot";
import { HaInstance } from "./haInstance";

const instance: HaInstance = { id: "ha-1", baseUrl: "http://ha.test:8123", token: "secret-token" };

describe("cameraSnapshotSource (ADR-HEARTH-182)", () => {
  test("prefers the entity_picture's own short-lived token, with no Authorization header", () => {
    expect(cameraSnapshotSource(instance, "camera.porch", "/api/camera_proxy/camera.porch?token=abc123")).toEqual({
      uri: "http://ha.test:8123/api/camera_proxy/camera.porch?token=abc123",
    });
  });

  test("keeps an already-absolute entity_picture URL as-is", () => {
    expect(cameraSnapshotSource(instance, "camera.porch", "https://other-host/camera.jpg")).toEqual({ uri: "https://other-host/camera.jpg" });
  });

  test("falls back to the REST proxy path with the shared Bearer token when there is no entity_picture", () => {
    expect(cameraSnapshotSource(instance, "camera.porch")).toEqual({
      uri: "http://ha.test:8123/api/camera_proxy/camera.porch",
      headers: { Authorization: "Bearer secret-token" },
    });
  });

  test("encodes the entity id in the fallback path", () => {
    expect(cameraSnapshotSource(instance, "camera.back yard").uri).toBe("http://ha.test:8123/api/camera_proxy/camera.back%20yard");
  });
});
