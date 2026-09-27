import { useEffect } from "react";
import { logger } from "../../core/logging/logger";
import { isDemoMode } from "../../demo/demoMode";
import { fetchFccCameras } from "../../drivers/camera/ring/fccCameraApi";
import { FccCameraDriver } from "../../drivers/camera/ring/FccCameraDriver";

const LOG_SCOPE = "useFccCameraPoll";
export const FCC_CAMERA_POLL_INTERVAL_MS = 5000;

export interface FccCameraPollDeps {
  fetchCameras: typeof fetchFccCameras;
  intervalMs: number;
  setIntervalFn: typeof setInterval;
  clearIntervalFn: typeof clearInterval;
}

const REAL_DEPS: FccCameraPollDeps = {
  fetchCameras: fetchFccCameras,
  intervalMs: FCC_CAMERA_POLL_INTERVAL_MS,
  setIntervalFn: setInterval,
  clearIntervalFn: clearInterval,
};

/**
 * Starts the actual `GET /api/cameras` refresh loop against `driver` (ADR-HEARTH-191): one poll
 * immediately, then one every `deps.intervalMs`, each applied via `driver.applyCameraViews`.
 * Returns the stop function. Extracted from the hook below so this is exercisable directly against
 * fakes/fake timers, without the React rendering infra this project doesn't otherwise use for
 * hooks (see useKeepScreenAwake.ts's own note).
 */
export function startFccCameraPolling(driver: FccCameraDriver, deps: FccCameraPollDeps = REAL_DEPS): () => void {
  let cancelled = false;

  async function poll(): Promise<void> {
    try {
      const response = await deps.fetchCameras();
      if (!cancelled) driver.applyCameraViews(response.cameras);
    } catch (err) {
      logger.warn(LOG_SCOPE, "Could not refresh cameras", { message: err instanceof Error ? err.message : String(err) });
    }
  }

  void poll();
  const timer = deps.setIntervalFn(() => void poll(), deps.intervalMs);
  return () => {
    cancelled = true;
    deps.clearIntervalFn(timer);
  };
}

/**
 * Mount-scoped 5-second refresh of `GET /api/cameras` (ADR-HEARTH-191) — same "start on mount,
 * stop on unmount" scoping as `useKeepScreenAwake.ts`'s activate/deactivate pair. `CameraControls`
 * calls this so a camera's own entity screen re-polls only while it is actually open; nothing
 * calls it from the generic Devices tab list, which stays mounted for as long as the app is and
 * would otherwise turn this into background polling.
 *
 * The applied views reach the UI through the ordinary path every driver already uses: `App.tsx`'s
 * `stateStoreBridge` subscribed this driver's `subscribeToState` for every camera device once, at
 * app launch, for the life of the app — `applyCameraViews` notifying those listeners is what
 * updates the shared `StateStore` `EntityControlScreen` reads, with no extra wiring needed here.
 *
 * Skips the network entirely in demo mode (`isDemoMode`), the same guard `useOfflineAlert.ts`
 * already uses for its own polling — the web verification harness renders camera state from fixed
 * demo devices instead (see `demoFccCameras.ts`).
 */
export function useFccCameraPoll(driver: FccCameraDriver | null | undefined): void {
  useEffect(() => {
    if (!driver || isDemoMode()) return undefined;
    return startFccCameraPolling(driver);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver]);
}
