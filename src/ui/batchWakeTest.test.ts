import { Device } from "../core/types/Device";
import { ConnectionState } from "../core/types/DeviceState";
import { BatchWakeRowResult, canBatchWakeTest, runBatchWakeTest } from "./batchWakeTest";
import { WakeTestDependencies } from "./WakeTestRunner";

function device(id: string, capabilities: Device["capabilities"] = ["powerOn"]): Device {
  return { id, name: id, category: "tv", manufacturer: "Test", driverId: "d", capabilities };
}

/** A fake WakeTestDependencies whose connection can be flipped from the test, same shape as WakeTestRunner.test.ts's own fixture. */
function fakeDeps(initial: ConnectionState = "disconnected", sendResult: string | null = null): WakeTestDependencies & { setConnection: (next: ConnectionState) => void } {
  let connection = initial;
  const listeners = new Set<(c: ConnectionState) => void>();
  return {
    sendPowerOn: () => Promise.resolve(sendResult),
    readConnection: () => connection,
    subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    now: () => Date.now(),
    setConnection: (next) => {
      connection = next;
      listeners.forEach((listener) => listener(next));
    },
  };
}

describe("canBatchWakeTest", () => {
  test("true when the device has powerOn or power", () => {
    expect(canBatchWakeTest(device("a", ["powerOn"]))).toBe(true);
    expect(canBatchWakeTest(device("a", ["power"]))).toBe(true);
  });

  test("false with neither capability (Roku, Sonos, Chromecast)", () => {
    expect(canBatchWakeTest(device("a", ["volumeUp"]))).toBe(false);
    expect(canBatchWakeTest(device("a", []))).toBe(false);
  });
});

describe("runBatchWakeTest", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("tests one device at a time, in order, and skips one with no power-on path without touching the network", async () => {
    const order: string[] = [];
    const succeeds = fakeDeps();
    const noCapability = device("plug", []);
    const devices = [device("tv"), noCapability];
    const results: Record<string, BatchWakeRowResult> = {};

    const run = runBatchWakeTest(
      devices,
      (d) => {
        order.push(d.id);
        return succeeds;
      },
      { onStatus: (id, result) => (results[id] = result) }
    );
    await Promise.resolve();
    jest.advanceTimersByTime(4000);
    succeeds.setConnection("connected");
    await run;

    expect(order).toEqual(["tv"]);
    expect(results.tv).toEqual({ status: "pass", message: "Woke in 4 s" });
    expect(results.plug).toEqual({ status: "skip", message: "No power-on command for this device." });
  });

  test("skips a device that already looks connected instead of failing it", async () => {
    const alreadyOn = fakeDeps("connected");
    const results: Record<string, BatchWakeRowResult> = {};
    await runBatchWakeTest([device("tv")], () => alreadyOn, { onStatus: (id, result) => (results[id] = result) });
    expect(results.tv).toEqual({ status: "skip", message: "Already on — skipped." });
  });

  test("reports a send failure as fail with its own message", async () => {
    const failsToSend = fakeDeps("disconnected", "Family Command Center isn't connected.");
    const results: Record<string, BatchWakeRowResult> = {};
    await runBatchWakeTest([device("tv")], () => failsToSend, { onStatus: (id, result) => (results[id] = result) });
    expect(results.tv).toEqual({ status: "fail", message: "Family Command Center isn't connected." });
  });

  test("reports a timeout as fail after the full wait", async () => {
    const neverAnswers = fakeDeps();
    const results: Record<string, BatchWakeRowResult> = {};
    const run = runBatchWakeTest([device("tv")], () => neverAnswers, { onStatus: (id, result) => (results[id] = result) });
    await Promise.resolve();
    jest.advanceTimersByTime(61_000);
    await run;
    expect(results.tv).toEqual({ status: "fail", message: "Didn't wake in time." });
  });

  test("marks every row waiting up front, then testing as its turn comes", async () => {
    const seen: BatchWakeRowResult[] = [];
    const alreadyOn = fakeDeps("connected");
    await runBatchWakeTest([device("a"), device("b")], () => alreadyOn, { onStatus: (_id, result) => seen.push(result) });
    expect(seen[0]).toEqual({ status: "waiting" });
    expect(seen[1]).toEqual({ status: "waiting" });
  });
});
