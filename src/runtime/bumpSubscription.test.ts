import { AccelerationSample } from "./bumpDetector";
import { AccelerometerModule, startBumpSubscription } from "./bumpSubscription";

const SPIKE: AccelerationSample = { x: 3, y: 0, z: 0 };

function fakeAccelerometer(available = true) {
  const listeners: Array<(sample: AccelerationSample) => void> = [];
  const remove = jest.fn();
  const module: AccelerometerModule = {
    isAvailableAsync: jest.fn().mockResolvedValue(available),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn((listener) => {
      listeners.push(listener);
      return { remove };
    }),
  };
  return { module, listeners, remove };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("startBumpSubscription", () => {
  test("a new bump handler is used without restarting the native sensor", async () => {
    const { module, listeners } = fakeAccelerometer();
    const first = jest.fn();
    const second = jest.fn();
    let current = first;
    startBumpSubscription(module, { getOnBump: () => current, onAvailable: jest.fn() });
    await flush();

    current = second;
    listeners[0](SPIKE);

    expect(module.addListener).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("reports starting, available and running in order when the sensor exists", async () => {
    const { module } = fakeAccelerometer();
    const calls: string[] = [];
    startBumpSubscription(module, {
      getOnBump: () => jest.fn(),
      onStarting: () => calls.push("starting"),
      onAvailable: () => calls.push("available"),
      onRunning: () => calls.push("running"),
    });
    await flush();
    expect(calls).toEqual(["starting", "available", "running"]);
  });

  test("never starts the sensor when it is unavailable", async () => {
    const { module } = fakeAccelerometer(false);
    const onAvailable = jest.fn();
    startBumpSubscription(module, { getOnBump: () => jest.fn(), onAvailable });
    await flush();
    expect(module.addListener).not.toHaveBeenCalled();
    expect(onAvailable).not.toHaveBeenCalled();
  });

  test("stopping before the availability check resolves never starts the sensor", async () => {
    const { module } = fakeAccelerometer();
    const stop = startBumpSubscription(module, { getOnBump: () => jest.fn(), onAvailable: jest.fn() });
    stop();
    await flush();
    expect(module.addListener).not.toHaveBeenCalled();
  });

  test("stopping after it started removes the native listener", async () => {
    const { module, remove } = fakeAccelerometer();
    const stop = startBumpSubscription(module, { getOnBump: () => jest.fn(), onAvailable: jest.fn() });
    await flush();
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test("an availability check that rejects is swallowed, not an unhandled rejection", async () => {
    const { module } = fakeAccelerometer();
    (module.isAvailableAsync as jest.Mock).mockRejectedValue(new Error("no native module"));
    const onAvailable = jest.fn();
    startBumpSubscription(module, { getOnBump: () => jest.fn(), onAvailable });
    await flush();
    expect(onAvailable).not.toHaveBeenCalled();
  });
});
