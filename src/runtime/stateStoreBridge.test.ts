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

  // Real-hardware finding (2026-09-10), Sean directly: "i have ALLOWED IT like 15 times, i don't
  // want to again." A driver's own autonomous background reconnect (never routed through
  // App.tsx's saveDeviceQuietly) learns a fresh pairing key that then only ever lived in memory.
  describe("onConnected", () => {
    test("fires once a device transitions from disconnected to connected, regardless of which code path caused it", async () => {
      const stateStore = new StateStore();
      const driver = fakeDriver({ connection: "disconnected", values: {}, lastUpdated: 1 });
      const onConnected = jest.fn();
      bridgeDeviceState(driver, device, stateStore, onConnected);
      await flushMicrotasks();

      expect(onConnected).not.toHaveBeenCalled();

      driver.emit({ connection: "connected", values: {}, lastUpdated: 2 });
      expect(onConnected).toHaveBeenCalledTimes(1);
      expect(onConnected).toHaveBeenCalledWith(device);
    });

    test("does not re-fire on every subsequent already-connected state update (e.g. a successful command)", async () => {
      const stateStore = new StateStore();
      const driver = fakeDriver({ connection: "connected", values: {}, lastUpdated: 1 });
      const onConnected = jest.fn();
      bridgeDeviceState(driver, device, stateStore, onConnected);
      await flushMicrotasks();

      expect(onConnected).not.toHaveBeenCalled(); // already connected at wiring time — not a transition

      driver.emit({ connection: "connected", values: { power: "on" }, lastUpdated: 2 });
      driver.emit({ connection: "connected", values: { power: "off" }, lastUpdated: 3 });
      expect(onConnected).not.toHaveBeenCalled();
    });

    test("fires again after a disconnect/reconnect cycle, matching a driver's own auto-reconnect learning a fresh client-key", async () => {
      const stateStore = new StateStore();
      const driver = fakeDriver({ connection: "connected", values: {}, lastUpdated: 1 });
      const onConnected = jest.fn();
      bridgeDeviceState(driver, device, stateStore, onConnected);
      await flushMicrotasks();

      driver.emit({ connection: "disconnected", values: {}, lastUpdated: 2 });
      driver.emit({ connection: "connected", values: {}, lastUpdated: 3 }); // e.g. scheduleReconnect's own retry, not App.tsx-initiated
      expect(onConnected).toHaveBeenCalledTimes(1);
    });
  });
});
