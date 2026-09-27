import { SnapshotImage } from "../../core/types/Snapshot";
import { HaInstance } from "./haInstance";

const CAMERA_PROXY_PATH = "/api/camera_proxy";

/**
 * The URI (and auth header, when needed) to load a camera entity's current snapshot (ADR-HEARTH-182).
 *
 * `GET /api/camera_proxy/<entity_id>` is documented (developers.home-assistant.io/docs/api/rest, fetched
 * 2026-09-27) and always works with the shared Bearer token. When the entity's own `entity_picture`
 * attribute is present it is preferred instead: Home Assistant's camera integration serves that path with
 * its own short-lived `access_token` query parameter, so the image loads with no Authorization header at
 * all — this specific behaviour is NOT on the fetched REST page (see the ADR's "Unverified"), only the
 * always-available proxy path is.
 */
export function cameraSnapshotSource(instance: HaInstance, entityId: string, entityPicture?: string): SnapshotImage {
  if (entityPicture) return { uri: entityPicture.startsWith("http") ? entityPicture : `${instance.baseUrl}${entityPicture}` };
  return { uri: `${instance.baseUrl}${CAMERA_PROXY_PATH}/${encodeURIComponent(entityId)}`, headers: { Authorization: `Bearer ${instance.token}` } };
}
