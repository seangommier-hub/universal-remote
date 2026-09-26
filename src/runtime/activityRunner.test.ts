import { mergeRetryResults, retryableIndexes, runActivity } from "./activityRunner";
import { Activity, ActivityStep } from "../core/types/Activity";
import { CommandResult } from "../core/types/Command";
import { CapabilityId } from "../core/types/Capability";

type ExecuteFn = (command: { deviceId: string; capability: CapabilityId; args?: Record<string, unknown> }) => Promise<CommandResult>;

function ok(deviceId: string, capability: CapabilityId): CommandResult {
  return { success: true, deviceId, capability, timestamp: 0 };
}

function fail(deviceId: string, capability: CapabilityId, message = "boom", code: "driver_error" | "unsupported_capability" = "driver_error"): CommandResult {
  return { success: false, deviceId, capability, timestamp: 0, error: { code, message } };
}

function makeActivity(steps: ActivityStep[]): Activity {
  return { id: "act-1", name: "Movie Night", steps, version: 1, updatedAt: "2026-09-26T00:00:00.000Z" };
}

function makeDeps(execute: ExecuteFn, values: Record<string, Record<string, unknown>> = {}) {
  const engine = { execute: jest.fn(execute) };
  const stateStore = { get: jest.fn((deviceId: string) => ({ connection: "connected" as const, values: values[deviceId] ?? {}, lastUpdated: 0 })) };
  return { engine, stateStore, deps: { commandEngine: engine, stateStore } };
}

const alwaysOk: ExecuteFn = async (c) => ok(c.deviceId, c.capability);
const cmd = (deviceId: string, capability: CapabilityId, extra: Partial<ActivityStep> = {}): ActivityStep =>
  ({ kind: "command", deviceId, capability, ...extra }) as ActivityStep;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("runActivity command steps", () => {
  test("runs steps in order, one at a time, and reports each ok", async () => {
    const order: string[] = [];
    const { deps } = makeDeps(async (c) => {
      order.push(`${c.deviceId}:${c.capability}`);
      return ok(c.deviceId, c.capability);
    });
    const result = await runActivity(makeActivity([cmd("tv", "powerOn"), cmd("rx", "mute")]), deps);
    expect(order).toEqual(["tv:powerOn", "rx:mute"]);
    expect(result.steps).toEqual([{ index: 0, status: "ok" }, { index: 1, status: "ok" }]);
    expect(result.cancelled).toBe(false);
  });

  test("passes args through to the engine", async () => {
    const { deps, engine } = makeDeps(alwaysOk);
    await runActivity(makeActivity([cmd("tv", "inputSelection", { args: { input: "hdmi1" } })]), deps);
    expect(engine.execute).toHaveBeenCalledWith({ deviceId: "tv", capability: "inputSelection", args: { input: "hdmi1" } }, { silent: true });
  });

  test("a failed step with the default policy does not stop later steps", async () => {
    const { deps } = makeDeps(async (c) => (c.deviceId === "tv" ? fail("tv", c.capability, "TV unreachable") : ok(c.deviceId, c.capability)));
    const result = await runActivity(makeActivity([cmd("tv", "powerOn"), cmd("rx", "mute")]), deps);
    expect(result.steps).toEqual([{ index: 0, status: "failed", error: "TV unreachable" }, { index: 1, status: "ok" }]);
  });

  test("onFail stop skips every remaining step", async () => {
    const { deps, engine } = makeDeps(async (c) => fail(c.deviceId, c.capability));
    const result = await runActivity(makeActivity([cmd("tv", "powerOn", { onFail: "stop" }), cmd("rx", "mute"), cmd("rx", "powerOn")]), deps);
    expect(result.steps.map((s) => s.status)).toEqual(["failed", "skipped", "skipped"]);
    expect(engine.execute).toHaveBeenCalledTimes(1);
  });

  test("an engine that throws is recorded as a failed step, never thrown", async () => {
    const { deps } = makeDeps(async () => {
      throw new Error("engine exploded");
    });
    const result = await runActivity(makeActivity([cmd("tv", "powerOn")]), deps);
    expect(result.steps).toEqual([{ index: 0, status: "failed", error: "engine exploded" }]);
  });
});

describe("runActivity retries", () => {
  test("retry:2 retries an idempotent command with backoff until it succeeds", async () => {
    let calls = 0;
    const { deps, engine } = makeDeps(async (c) => (++calls < 3 ? fail(c.deviceId, c.capability) : ok(c.deviceId, c.capability)));
    const promise = runActivity(makeActivity([cmd("tv", "powerOn", { onFail: "retry:2" })]), deps);
    await jest.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(engine.execute).toHaveBeenCalledTimes(3);
    expect(result.steps).toEqual([{ index: 0, status: "ok" }]);
  });

  test("retries exhausted marks failed and stops the run", async () => {
    const { deps, engine } = makeDeps(async (c) => fail(c.deviceId, c.capability, "still down"));
    const promise = runActivity(makeActivity([cmd("tv", "powerOn", { onFail: "retry:1" }), cmd("rx", "mute")]), deps);
    await jest.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(engine.execute).toHaveBeenCalledTimes(2);
    expect(result.steps.map((s) => s.status)).toEqual(["failed", "skipped"]);
  });

  test("a power toggle whose result failed is never sent twice", async () => {
    const { deps, engine } = makeDeps(async (c) => fail(c.deviceId, c.capability));
    const promise = runActivity(makeActivity([cmd("tv", "power", { onFail: "retry:3" })]), deps);
    await jest.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(engine.execute).toHaveBeenCalledTimes(1);
    expect(result.steps[0].status).toBe("failed");
  });

  test("a power toggle whose engine call threw before sending is retried", async () => {
    let calls = 0;
    const { deps, engine } = makeDeps(async (c) => {
      if (++calls === 1) throw new Error("socket closed before send");
      return ok(c.deviceId, c.capability);
    });
    const promise = runActivity(makeActivity([cmd("tv", "power", { onFail: "retry:1" })]), deps);
    await jest.advanceTimersByTimeAsync(10_000);
    expect((await promise).steps[0].status).toBe("ok");
    expect(engine.execute).toHaveBeenCalledTimes(2);
  });

  test("errors that cannot improve (unsupported capability) are not retried", async () => {
    const { deps, engine } = makeDeps(async (c) => fail(c.deviceId, c.capability, "nope", "unsupported_capability"));
    const promise = runActivity(makeActivity([cmd("tv", "powerOn", { onFail: "retry:3" })]), deps);
    await jest.advanceTimersByTimeAsync(10_000);
    await promise;
    expect(engine.execute).toHaveBeenCalledTimes(1);
  });
});

describe("runActivity delay and waitFor", () => {
  test("a delay step waits its full time before the next step runs", async () => {
    const { deps, engine } = makeDeps(alwaysOk);
    const promise = runActivity(makeActivity([{ kind: "delay", ms: 5000 }, cmd("tv", "powerOn")]), deps);
    await jest.advanceTimersByTimeAsync(4999);
    expect(engine.execute).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    const result = await promise;
    expect(engine.execute).toHaveBeenCalledTimes(1);
    expect(result.steps.map((s) => s.status)).toEqual(["ok", "ok"]);
  });

  test("waitFor passes immediately when the state already matches", async () => {
    const { deps } = makeDeps(alwaysOk, { tv: { power: "on" } });
    const result = await runActivity(makeActivity([{ kind: "waitFor", deviceId: "tv", stateKey: "power", equals: "on", timeoutMs: 5000 }]), deps);
    expect(result.steps).toEqual([{ index: 0, status: "ok" }]);
  });

  test("waitFor polls until the value changes", async () => {
    const values: Record<string, Record<string, unknown>> = { tv: { power: "off" } };
    const { deps } = makeDeps(alwaysOk, values);
    const promise = runActivity(makeActivity([{ kind: "waitFor", deviceId: "tv", stateKey: "power", equals: "on", timeoutMs: 20_000 }, cmd("rx", "powerOn")]), deps);
    await jest.advanceTimersByTimeAsync(3000);
    values.tv.power = "on";
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.steps.map((s) => s.status)).toEqual(["ok", "ok"]);
  });

  test("waitFor timeout stops the run by default", async () => {
    const { deps, engine } = makeDeps(alwaysOk, { tv: { power: "off" } });
    const promise = runActivity(makeActivity([{ kind: "waitFor", deviceId: "tv", stateKey: "power", equals: "on", timeoutMs: 2000 }, cmd("rx", "powerOn")]), deps);
    await jest.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result.steps[0].status).toBe("failed");
    expect(result.steps[0].error).toMatch(/Timed out/);
    expect(result.steps[1].status).toBe("skipped");
    expect(engine.execute).not.toHaveBeenCalled();
  });

  test("waitFor timeout with onTimeout continue lets later steps run", async () => {
    const { deps } = makeDeps(alwaysOk, { tv: { power: "off" } });
    const promise = runActivity(makeActivity([{ kind: "waitFor", deviceId: "tv", stateKey: "power", equals: "on", timeoutMs: 1000, onTimeout: "continue" }, cmd("rx", "powerOn")]), deps);
    await jest.advanceTimersByTimeAsync(5000);
    expect((await promise).steps.map((s) => s.status)).toEqual(["failed", "ok"]);
  });
});

describe("runActivity cancellation, progress and ids", () => {
  test("cancelling during a delay skips the rest and flags the run cancelled", async () => {
    const controller = new AbortController();
    const { deps, engine } = makeDeps(alwaysOk);
    const promise = runActivity(makeActivity([{ kind: "delay", ms: 60_000 }, cmd("tv", "powerOn")]), deps, { signal: controller.signal });
    await jest.advanceTimersByTimeAsync(1000);
    controller.abort();
    const result = await promise;
    expect(result.cancelled).toBe(true);
    expect(result.steps.map((s) => s.status)).toEqual(["skipped", "skipped"]);
    expect(engine.execute).not.toHaveBeenCalled();
  });

  test("cancelling during a waitFor stops polling", async () => {
    const controller = new AbortController();
    const { deps } = makeDeps(alwaysOk, { tv: { power: "off" } });
    const promise = runActivity(makeActivity([{ kind: "waitFor", deviceId: "tv", stateKey: "power", equals: "on", timeoutMs: 60_000 }]), deps, { signal: controller.signal });
    await jest.advanceTimersByTimeAsync(1200);
    controller.abort();
    const result = await promise;
    expect(result.cancelled).toBe(true);
    expect(result.steps[0].status).toBe("skipped");
  });

  test("an already-aborted signal runs nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const { deps, engine } = makeDeps(alwaysOk);
    const result = await runActivity(makeActivity([cmd("tv", "powerOn")]), deps, { signal: controller.signal });
    expect(engine.execute).not.toHaveBeenCalled();
    expect(result.steps).toEqual([{ index: 0, status: "skipped" }]);
  });

  test("uses the supplied run id and generates one otherwise", async () => {
    const { deps } = makeDeps(alwaysOk);
    const fixed = await runActivity(makeActivity([cmd("tv", "powerOn")]), deps, { runId: "run-abc" });
    const generated = await runActivity(makeActivity([cmd("tv", "powerOn")]), deps);
    expect(fixed.runId).toBe("run-abc");
    expect(generated.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("reports running and done progress for every step", async () => {
    const { deps } = makeDeps(alwaysOk);
    const events: string[] = [];
    await runActivity(makeActivity([cmd("tv", "powerOn"), cmd("rx", "mute")]), deps, {
      onProgress: (p) => events.push(`${p.index}:${p.phase}:${p.status ?? "-"}`),
    });
    expect(events).toEqual(["0:running:-", "0:done:ok", "1:running:-", "1:done:ok"]);
  });
});

describe("retry helpers", () => {
  test("onlyIndexes re-runs just those steps and omits the rest", async () => {
    const { deps, engine } = makeDeps(alwaysOk);
    const result = await runActivity(makeActivity([cmd("tv", "powerOn"), cmd("rx", "mute"), cmd("rx", "powerOn")]), deps, { onlyIndexes: [1] });
    expect(engine.execute).toHaveBeenCalledTimes(1);
    expect(result.steps).toEqual([{ index: 1, status: "ok" }]);
  });

  test("retryableIndexes covers failed and never-run steps", () => {
    expect(retryableIndexes([{ index: 0, status: "ok" }, { index: 1, status: "failed" }, { index: 2, status: "skipped" }])).toEqual([1, 2]);
  });

  test("mergeRetryResults replaces re-run steps and keeps the rest in order", () => {
    const merged = mergeRetryResults(
      [{ index: 0, status: "ok" }, { index: 1, status: "failed", error: "x" }, { index: 2, status: "skipped" }],
      [{ index: 1, status: "ok" }]
    );
    expect(merged).toEqual([{ index: 0, status: "ok" }, { index: 1, status: "ok" }, { index: 2, status: "skipped" }]);
  });
});
