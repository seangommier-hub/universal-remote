import { ConnectionState } from "../core/types/DeviceState";
import { StateStore } from "../core/state/StateStore";
import { createWakeTestDependencies, describeWakeResult, powerOnCapability, WakeTestPhase, WakeTestRunner, WAKE_TEST_TIMEOUT_SECONDS } from "./WakeTestRunner";

function setup(initial: ConnectionState = "disconnected", sendResult: string | null = null) {
  let connection = initial;
  const listeners = new Set<(c: ConnectionState) => void>();
  const phases: WakeTestPhase[] = [];
  const sendPowerOn = jest.fn().mockResolvedValue(sendResult);
  const runner = new WakeTestRunner(
    { sendPowerOn, readConnection: () => connection, subscribe: (l) => (listeners.add(l), () => listeners.delete(l)), now: () => Date.now() },
    (phase) => phases.push(phase)
  );
  const setConnection = (next: ConnectionState) => {
    connection = next;
    listeners.forEach((l) => l(next));
  };
  return { runner, phases, sendPowerOn, setConnection, listeners };
}

describe("WakeTestRunner", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("reports success with the seconds it took when the device reconnects", async () => {
    const { runner, sendPowerOn, setConnection } = setup();
    await runner.start();
    expect(sendPowerOn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(9000);
    setConnection("connected");
    expect(runner.getPhase()).toEqual({ kind: "success", seconds: 9 });
    expect(describeWakeResult(runner.getPhase())).toBe("Woke in 9 s");
  });

  it("counts down while waiting", async () => {
    const { runner } = setup();
    await runner.start();
    jest.advanceTimersByTime(5000);
    expect(runner.getPhase()).toEqual({ kind: "waiting", elapsedSeconds: 5, remainingSeconds: WAKE_TEST_TIMEOUT_SECONDS - 5 });
  });

  it("times out after the limit and stops watching", async () => {
    const { runner, listeners } = setup();
    await runner.start();
    jest.advanceTimersByTime(WAKE_TEST_TIMEOUT_SECONDS * 1000);
    expect(runner.getPhase()).toEqual({ kind: "timeout" });
    expect(listeners.size).toBe(0);
  });

  it("returns to idle and ignores a late connection when cancelled", async () => {
    const { runner, setConnection } = setup();
    await runner.start();
    runner.cancel();
    setConnection("connected");
    jest.advanceTimersByTime(3000);
    expect(runner.getPhase()).toEqual({ kind: "idle" });
  });

  it("refuses to start while the device already looks connected", async () => {
    const { runner, sendPowerOn } = setup("connected");
    await runner.start();
    expect(runner.getPhase()).toEqual({ kind: "still-on" });
    expect(sendPowerOn).not.toHaveBeenCalled();
  });

  it("reports a send failure with its reason", async () => {
    const { runner } = setup("disconnected", "Family Command Center isn't connected.");
    await runner.start();
    expect(runner.getPhase()).toEqual({ kind: "send-failed", message: "Family Command Center isn't connected." });
  });
});

describe("createWakeTestDependencies", () => {
  const device = { id: "tv", name: "TV", category: "tv" as const, manufacturer: "LG", driverId: "d", capabilities: ["powerOn" as const, "power" as const] };

  it("prefers powerOn over power", () => {
    expect(powerOnCapability(device)).toBe("powerOn");
    expect(powerOnCapability({ ...device, capabilities: ["power"] })).toBe("power");
    expect(powerOnCapability({ ...device, capabilities: [] })).toBeNull();
  });

  it("sends through the command engine and reports its failure message", async () => {
    const execute = jest.fn().mockResolvedValue({ success: false, error: { code: "driver_error", message: "no MAC" } });
    const deps = createWakeTestDependencies(device, { execute } as never, new StateStore());
    expect(await deps.sendPowerOn()).toContain("no MAC");
    expect(execute).toHaveBeenCalledWith({ deviceId: "tv", capability: "powerOn" });
  });

  it("reads and subscribes to the state store's connection", () => {
    const store = new StateStore();
    const deps = createWakeTestDependencies(device, { execute: jest.fn() } as never, store);
    const seen: ConnectionState[] = [];
    deps.subscribe((c) => seen.push(c));
    store.patch("tv", {}, "connected");
    expect(deps.readConnection()).toBe("connected");
    expect(seen).toEqual(["connected"]);
  });
});
