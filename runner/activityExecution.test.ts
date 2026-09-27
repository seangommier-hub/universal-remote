/** @jest-environment node */
import { Activity } from "../src/core/types/Activity";
import { CapabilityId } from "../src/core/types/Capability";
import { CommandResult } from "../src/core/types/Command";
import { DeviceState } from "../src/core/types/DeviceState";
import { ActivityExecutor, runActivityHeadless } from "./activityExecution";

const NOW = 1_000_000;
const DEVICES = [
  { id: "den", name: "Den TV", driverId: "sony-bravia" },
  { id: "living", name: "Living TV", driverId: "lg-webos-wss3001" },
  { id: "bedroom", name: "Bedroom TV", driverId: "samsung-tizen" },
];

class FakeExecutor implements ActivityExecutor {
  sent: Array<{ deviceId: string; capability: string }> = [];
  states = new Map<string, DeviceState>();
  connectError: string | null = null;

  async connect(): Promise<string | null> {
    return this.connectError;
  }

  async execute(deviceId: string, capability: CapabilityId): Promise<CommandResult> {
    this.sent.push({ deviceId, capability });
    return { success: true, deviceId, capability, timestamp: NOW };
  }

  getState(deviceId: string): DeviceState | null {
    return this.states.get(deviceId) ?? null;
  }

  listDevices() {
    return DEVICES;
  }
}

function activity(steps: Activity["steps"]): Activity {
  return { id: "bedtime", name: "Bedtime", steps, version: 1, updatedAt: "" };
}

function stateOf(power: unknown, lastUpdated = NOW): DeviceState {
  return { connection: "connected", values: { power }, lastUpdated };
}

test("powerOff and delay steps on supported drivers run in order", async () => {
  const executor = new FakeExecutor();
  const result = await runActivityHeadless(activity([{ kind: "command", deviceId: "living", capability: "powerOff" }, { kind: "delay", ms: 1 }, { kind: "command", deviceId: "den", capability: "powerOff" }]), executor, { now: () => NOW });
  expect(result.steps.map((step) => step.status)).toEqual(["ok", "ok", "ok"]);
  expect(executor.sent).toEqual([{ deviceId: "living", capability: "powerOff" }, { deviceId: "den", capability: "powerOff" }]);
});

test("a step on an unsupported driver is skipped with the reason and never sent", async () => {
  const executor = new FakeExecutor();
  const result = await runActivityHeadless(activity([{ kind: "command", deviceId: "bedroom", capability: "powerOff" }, { kind: "command", deviceId: "living", capability: "powerOff" }]), executor, { now: () => NOW });
  expect(result.steps[0]).toEqual({ index: 0, status: "skipped", error: expect.stringContaining("samsung-tizen") });
  expect(result.steps[1].status).toBe("ok");
  expect(executor.sent).toEqual([{ deviceId: "living", capability: "powerOff" }]);
});

test("an unknown device and a capability outside power-off are skipped and reported", async () => {
  const executor = new FakeExecutor();
  const result = await runActivityHeadless(
    activity([{ kind: "command", deviceId: "ghost", capability: "powerOff" }, { kind: "command", deviceId: "living", capability: "setVolume", args: { volume: 3 } }]),
    executor,
    { now: () => NOW }
  );
  expect(result.steps.map((step) => step.status)).toEqual(["skipped", "skipped"]);
  expect(result.steps[0].error).toMatch(/not known to the Pi/);
  expect(result.steps[1].error).toMatch(/setVolume/);
  expect(executor.sent).toEqual([]);
});

test("toggle power is sent only when the device is freshly confirmed on", async () => {
  const executor = new FakeExecutor();
  executor.states.set("den", stateOf("on"));
  const result = await runActivityHeadless(activity([{ kind: "command", deviceId: "den", capability: "power" }]), executor, { now: () => NOW });
  expect(result.steps[0]).toEqual({ index: 0, status: "ok" });
  expect(executor.sent).toEqual([{ deviceId: "den", capability: "power" }]);
});

test("toggle power on a device that is already off sends nothing and says so", async () => {
  const executor = new FakeExecutor();
  executor.states.set("den", stateOf("off"));
  const result = await runActivityHeadless(activity([{ kind: "command", deviceId: "den", capability: "power" }]), executor, { now: () => NOW });
  expect(result.steps[0]).toEqual({ index: 0, status: "skipped", error: expect.stringContaining("Already off") });
  expect(executor.sent).toEqual([]);
});

test("toggle power with stale or unknown state fails without sending", async () => {
  const executor = new FakeExecutor();
  executor.states.set("den", stateOf("on", NOW - 10 * 60_000));
  const stale = await runActivityHeadless(activity([{ kind: "command", deviceId: "den", capability: "power" }]), executor, { now: () => NOW });
  expect(stale.steps[0].status).toBe("failed");
  executor.states.set("den", stateOf(undefined));
  const unknown = await runActivityHeadless(activity([{ kind: "command", deviceId: "den", capability: "power" }]), executor, { now: () => NOW });
  expect(unknown.steps[0].status).toBe("failed");
  expect(executor.sent).toEqual([]);
});

test("toggle power reports a connection failure instead of guessing", async () => {
  const executor = new FakeExecutor();
  executor.connectError = "unreachable";
  const result = await runActivityHeadless(activity([{ kind: "command", deviceId: "den", capability: "power" }]), executor, { now: () => NOW });
  expect(result.steps[0]).toEqual({ index: 0, status: "failed", error: "unreachable" });
});

test("the run keeps the caller's runId", async () => {
  const result = await runActivityHeadless(activity([{ kind: "delay", ms: 0 }]), new FakeExecutor(), { runId: "fixed-run" });
  expect(result.runId).toBe("fixed-run");
});
