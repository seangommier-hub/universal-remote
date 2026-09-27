/** One entry of `GET /api/cameras`'s `cameras` array (Family Command Center's Ring integration,
 * ADR-HEARTH-191). This is the Pi's own contract, fixed by its already-shipped implementation
 * (family-command-center commit 651f48d) — Hearth maps it into a `Device`/`DeviceState`, never
 * re-shapes it upstream. */
export interface CameraView {
  id: string;
  name: string;
  kind: "camera" | "doorbell";
  powerSource: "wired" | "battery" | "unknown";
  /** Subset of "live" | "snapshot" | "motion" | "ding" | "battery" | "light" | "siren" — Hearth
   * only ever reads "snapshot"/"ding"/"battery" today (ADR-HEARTH-191); the rest are surfaced for
   * a later phase (live view, event history — see ADR-HEARTH-187) and otherwise ignored. */
  capabilities: string[];
  sortOrder: number;
  enabled: boolean;
  availability: "online" | "offline" | "ring_unavailable" | "auth_required";
  streamStatus: "idle" | "prewarming" | "starting" | "live" | "stopping" | "error";
  motionActive: boolean;
  lastMotionAt: string | null;
  lastDingAt: string | null;
  lastEventType: string | null;
  lastEventAt: string | null;
  batteryLevel: number | null;
  snapshotAt: string | null;
  /** Relative to the Pi's own base URL (e.g. "/api/cameras/<id>/snapshot"); null when no snapshot has been captured yet. */
  snapshotUrl: string | null;
}

/** The parsed body of `GET /api/cameras`. `enabled: false` means the household hasn't turned this
 * feature on at all (Pi adr/0216) — Hearth must then show no camera UI anywhere and make no
 * further camera calls (ADR-HEARTH-187). */
export interface FccCamerasResponse {
  enabled: boolean;
  cameras: CameraView[];
}
