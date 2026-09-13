import { runScene } from "./sceneRunner";
import { Scene } from "../core/types/Scene";
import { CommandEngine } from "../core/engine/CommandEngine";
import { CommandResult } from "../core/types/Command";

function fakeEngine(results: CommandResult[]): CommandEngine {
  let call = 0;
  return { execute: jest.fn(async () => results[call++]) } as unknown as CommandEngine;
}

function success(deviceId: string, capability: string): CommandResult {
  return { success: true, deviceId, capability: capability as CommandResult["capability"], timestamp: Date.now() };
}

function failure(deviceId: string, capability: string, message: string): CommandResult {
  return {
    success: false,
    deviceId,
    capability: capability as CommandResult["capability"],
    timestamp: Date.now(),
    error: { code: "driver_error", message },
  };
}

const scene: Scene = {
  id: "scene-1",
  name: "Movie Night",
  actions: [
    { deviceId: "tv-1", capability: "powerOff" },
    { deviceId: "receiver-1", capability: "mute" },
  ],
};

describe("runScene", () => {
  test("runs every action in order, one at a time, not in parallel", async () => {
    const order: string[] = [];
    const engine = {
      execute: jest.fn(async (command) => {
        order.push(`${command.deviceId}:${command.capability}`);
        return success(command.deviceId, command.capability);
      }),
    } as unknown as CommandEngine;

    await runScene(scene, engine);

    expect(order).toEqual(["tv-1:powerOff", "receiver-1:mute"]);
    expect(engine.execute).toHaveBeenCalledTimes(2);
  });

  test("all actions succeeding reports zero failures", async () => {
    const engine = fakeEngine([success("tv-1", "powerOff"), success("receiver-1", "mute")]);

    const result = await runScene(scene, engine);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toEqual([]);
  });

  test("one action failing doesn't stop the rest of the scene from running", async () => {
    const engine = fakeEngine([failure("tv-1", "powerOff", "TV unreachable"), success("receiver-1", "mute")]);

    const result = await runScene(scene, engine);

    expect(engine.execute).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toEqual([{ deviceId: "tv-1", capability: "powerOff", message: "TV unreachable" }]);
  });

  test("every action failing reports all of them, not just the first", async () => {
    const engine = fakeEngine([failure("tv-1", "powerOff", "TV unreachable"), failure("receiver-1", "mute", "Receiver unreachable")]);

    const result = await runScene(scene, engine);

    expect(result.succeeded).toBe(0);
    expect(result.failed).toEqual([
      { deviceId: "tv-1", capability: "powerOff", message: "TV unreachable" },
      { deviceId: "receiver-1", capability: "mute", message: "Receiver unreachable" },
    ]);
  });

  test("an action's args (e.g. inputSelection's input id) are passed through to the command engine", async () => {
    const engine = fakeEngine([success("tv-1", "inputSelection")]);
    const inputScene: Scene = { id: "s", name: "S", actions: [{ deviceId: "tv-1", capability: "inputSelection", args: { input: "hdmi1" } }] };

    await runScene(inputScene, engine);

    expect(engine.execute).toHaveBeenCalledWith({ deviceId: "tv-1", capability: "inputSelection", args: { input: "hdmi1" } });
  });

  test("an empty scene runs cleanly with no actions", async () => {
    const engine = fakeEngine([]);
    const emptyScene: Scene = { id: "empty", name: "Empty", actions: [] };

    const result = await runScene(emptyScene, engine);

    expect(result).toEqual({ succeeded: 0, failed: [] });
    expect(engine.execute).not.toHaveBeenCalled();
  });

  test("a failure with no error object still reports a usable message", async () => {
    const engine = fakeEngine([{ success: false, deviceId: "tv-1", capability: "powerOff", timestamp: Date.now() }]);
    const oneActionScene: Scene = { id: "s", name: "S", actions: [{ deviceId: "tv-1", capability: "powerOff" }] };

    const result = await runScene(oneActionScene, engine);

    expect(result.failed[0].message).toBe("Unknown error");
  });
});
