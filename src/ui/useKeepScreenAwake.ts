import { useEffect } from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { logger } from "../core/logging/logger";

// One tag for every remote screen instance — activateKeepAwakeAsync/deactivateKeepAwake ref-count
// per tag, not globally, so this must be the same string on both the activate and deactivate call
// for the lock to actually release (see expo-keep-awake's own doc comment on `tag`).
export const REMOTE_SCREEN_KEEP_AWAKE_TAG = "hearth-remote-screen";

export interface KeepAwakeControls {
  activate: (tag?: string) => Promise<void>;
  deactivate: (tag?: string) => Promise<void>;
}

const realControls: KeepAwakeControls = { activate: activateKeepAwakeAsync, deactivate: deactivateKeepAwake };

/** Requests keep-awake, logging (never throwing) if the platform call rejects — extracted from the hook below so this can be exercised directly against a fake, without the React rendering infra this project doesn't otherwise use for hooks (see useSwipeBackGesture.ts's own note). */
export function activateRemoteKeepAwake(controls: KeepAwakeControls): void {
  controls.activate(REMOTE_SCREEN_KEEP_AWAKE_TAG).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("useKeepScreenAwake", "Could not activate keep-awake", { message });
  });
}

/** Releases the keep-awake request made by activateRemoteKeepAwake — same fake-friendly split. */
export function deactivateRemoteKeepAwake(controls: KeepAwakeControls): void {
  controls.deactivate(REMOTE_SCREEN_KEEP_AWAKE_TAG).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("useKeepScreenAwake", "Could not deactivate keep-awake", { message });
  });
}

/**
 * Keeps the device screen from auto-locking for as long as the calling component stays mounted —
 * ADR-HEARTH-158 Tier 2 item 8. A remote screen (UniversalTvRemote) mounts/unmounts on open/close
 * (DevicesTabScreen renders it only while `screen.name === "remote"`, keyed by device id — see that
 * file's own comment), so calling this once at that screen's top level scopes the lock to exactly
 * "a remote is open", never the Devices list, Activities, or settings.
 */
export function useKeepScreenAwake(controls: KeepAwakeControls = realControls): void {
  useEffect(() => {
    activateRemoteKeepAwake(controls);
    return () => deactivateRemoteKeepAwake(controls);
    // Intentionally mount/unmount-only (see activateRemoteKeepAwake's own tag comment) — a fresh
    // `controls` object on every render (the default parameter) must never re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
