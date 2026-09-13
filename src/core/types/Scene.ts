import { CapabilityId } from "./Capability";

/**
 * One step in a Scene: run `capability` on `deviceId`, with `args` for the handful of capabilities
 * that need one (currently just `inputSelection` — see ADR-HEARTH-059). Every other capability a
 * scene can use is still no-arg (ADR-HEARTH-056); `args` is optional so those actions are unchanged.
 */
export interface SceneAction {
  deviceId: string;
  capability: CapabilityId;
  args?: Record<string, unknown>;
}

/** A named, manually-triggered group of actions across one or more devices — e.g. "Movie Night" (power on the TV, mute the receiver). Run in order, one at a time, via runScene (src/runtime/sceneRunner.ts). */
export interface Scene {
  id: string;
  name: string;
  actions: SceneAction[];
}
