import { CommandEngine } from "../core/engine/CommandEngine";
import { Scene, SceneAction } from "../core/types/Scene";
import { logger } from "../core/logging/logger";

const LOG_SCOPE = "sceneRunner";

/** A SceneAction that failed, carrying everything needed to retry it exactly as originally specified (including args, e.g. inputSelection's input id) plus why it failed. */
export interface FailedSceneAction extends SceneAction {
  message: string;
}

export interface SceneRunResult {
  succeeded: number;
  failed: FailedSceneAction[];
}

/**
 * Runs a list of actions one at a time, in order (not parallel) — a real remote-control action
 * against a device that's mid-reconnect can race with another command to the same device the same
 * way any two rapid taps could; sequencing avoids piling several at once. Never throws: one
 * action's failure (device offline, capability rejected) doesn't stop the rest from running,
 * matching CommandEngine.execute's own "never throws, caller checks success" contract one level up.
 * Shared by runScene (a Scene's full action list) and retrySceneActions (real-hardware/UX research,
 * 2026-09-16 — Logitech Harmony's Activity system's own "Help" feature retries just the specific
 * step that's out of sync rather than re-running the whole activity; see ADR-HEARTH-073) so both
 * go through the identical sequencing/logging/error-handling instead of two copies that could drift.
 */
async function runActions(actions: SceneAction[], commandEngine: CommandEngine, logContext: string): Promise<SceneRunResult> {
  const result: SceneRunResult = { succeeded: 0, failed: [] };
  for (const action of actions) {
    const outcome = await commandEngine.execute({ deviceId: action.deviceId, capability: action.capability, args: action.args });
    if (outcome.success) {
      result.succeeded++;
    } else {
      const message = outcome.error?.message ?? "Unknown error";
      result.failed.push({ ...action, message });
      logger.warn(LOG_SCOPE, `${logContext} action failed`, { deviceId: action.deviceId, capability: action.capability, message });
    }
  }
  return result;
}

export async function runScene(scene: Scene, commandEngine: CommandEngine): Promise<SceneRunResult> {
  return runActions(scene.actions, commandEngine, `Scene "${scene.name}"`);
}

/** Re-runs exactly the failed actions from a previous runScene/retrySceneActions result — nothing that already succeeded is touched again. */
export async function retrySceneActions(failed: FailedSceneAction[], commandEngine: CommandEngine, sceneName: string): Promise<SceneRunResult> {
  return runActions(failed, commandEngine, `Scene "${sceneName}" retry`);
}
