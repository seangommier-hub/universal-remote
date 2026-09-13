import { CommandEngine } from "../core/engine/CommandEngine";
import { Scene } from "../core/types/Scene";
import { logger } from "../core/logging/logger";

const LOG_SCOPE = "sceneRunner";

export interface SceneRunResult {
  succeeded: number;
  failed: { deviceId: string; capability: string; message: string }[];
}

/**
 * Runs a Scene's actions one at a time, in order (not parallel) — a real remote-control action
 * against a device that's mid-reconnect can race with another command to the same device the same
 * way any two rapid taps could; sequencing scene actions avoids piling several at once. Never
 * throws: one action's failure (device offline, capability rejected) doesn't stop the rest of the
 * scene from running, matching CommandEngine.execute's own "never throws, caller checks success"
 * contract at the scene level.
 */
export async function runScene(scene: Scene, commandEngine: CommandEngine): Promise<SceneRunResult> {
  const result: SceneRunResult = { succeeded: 0, failed: [] };
  for (const action of scene.actions) {
    const outcome = await commandEngine.execute({ deviceId: action.deviceId, capability: action.capability, args: action.args });
    if (outcome.success) {
      result.succeeded++;
    } else {
      const message = outcome.error?.message ?? "Unknown error";
      result.failed.push({ deviceId: action.deviceId, capability: action.capability, message });
      logger.warn(LOG_SCOPE, `Scene "${scene.name}" action failed`, { deviceId: action.deviceId, capability: action.capability, message });
    }
  }
  return result;
}
