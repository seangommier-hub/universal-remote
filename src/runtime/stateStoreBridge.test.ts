import { bridgeDeviceState } from "./stateStoreBridge";
import { StateStore } from "../core/state/StateStore";
import { DeviceDriver, StateChangeListener } from "../core/drivers/DeviceDriver";
import { Device } from "../core/types/Device";
import { DeviceState } from "../core/types/DeviceState";

const device: Device = {
  id: "lg-1",
  name: "Bedroom LG",
  category: "tv",
  manufacturer: "LG",
  driverId: "lg-webos-wss3001",
  capabilities: ["powerOff"],
  config: { ipAddress: "192.168.1.70" },
};

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** A driver double exposing only the two members bridgeDeviceState actually depends on — everything else throws if touched, so a wiring bug here shows up immediately rather than silently. */
function fakeDriver(initialState: DeviceState): DeviceDriver & { emit: (state: DeviceState) => void } {
  let listener: StateChangeListener | null = null;
  return {
    id: "fake",
    displayName: "Fake",
    getCapabilities: () => [],
    connect: async () => {
      throw new Error("not used by this test");
    },
    disconnect: async () => {
      throw new Error("not used by this test");
    },
    executeCommand: async () => {
      throw new Error("not used by this test");
    },
    getState: async () => initialState,
    subscribeToState: (_device, l) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
    emit: (state: DeviceState) => listener?.(device.id, state),
  };
}

describe("bridgeDeviceState", () => {
  test("seeds the shared StateStore with the driver's current state on wiring", async () => {
    const stateStore = new StateStore();
    const driver = fakeDriver({ connection: "connected", values: { power: "on" }, lastUpdated: 1 });

    bridgeDeviceState(driver, device, stateStore);
    await flushMicrotasks();

    expect(stateStore.get(device.id)).toMatchObject({ connection: "connected", values: { power: "on" } });
  });

  test("propagates every subsequent driver state change into the shared StateStore (the real-hardware gap this closes)", async () => {
    const stateStore = new StateStore();
    const driver = fakeDriver({ connection: "connected", values: {}, lastUpdated: 1 });
    bridgeDeviceState(driver, device, stateStore);
    await flushMicrotasks();

    // The exact scenario that was silently broken: an unexpected disconnect the driver detects
    // on its own (ADR-HEARTH-017's auto-reconnect) previously never reached the UI's StateStore.
    driver.emit({ connection: "disconnected", values: {}, lastUpdated: 2 });
    expect(stateStore.get(device.id).connection).toBe("disconnected");

    driver.emit({ connection: "connected", values: { power: "on" }, lastUpdated: 3 });
    expect(stateStore.get(device.id)).toMatchObject({ connection: "connected", values: { power: "on" } });
  });

  test("returns an unsubscribe function that stops further propagation", async () => {
    const stateStore = new StateStore();
    const driver = fakeDriver({ connection: "connected", values: {}, lastUpdated: 1 });
    const unsubscribe = bridgeDeviceState(driver, device, stateStore);
    await flushMicrotasks();

    unsubscribe();
    driver.emit({ connection: "disconnected", values: {}, lastUpdated: 2 });

    expect(stateStore.get(device.id).connection).toBe("connected"); // unchanged — no longer listening
  });
});
