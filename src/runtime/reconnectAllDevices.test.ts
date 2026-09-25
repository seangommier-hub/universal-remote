import { Device } from "../core/types/Device";
import { reconnectAllDevices } from "./reconnectAllDevices";
import { HearthRuntime } from "./bootstrap";

function device(id: string): Device {
  return { id, name: id, category: "tv", manufacturer: "LG", driverId: "d-" + id, capabilities: [], config: {} };
}

function runtimeWith(drivers: Record<string, unknown>): HearthRuntime {
  return { driverRegistry: { get: (id: string) => drivers[id] } } as unknown as HearthRuntime;
}

describe("reconnectAllDevices", () => {
  test("a driver whose live connection is proven alive is not reconnected", async () => {
    const connect = jest.fn();
    const onConnected = jest.fn();
    await reconnectAllDevices(runtimeWith({ "d-a": { isConnectionAlive: async () => true, connect } }), [device("a")], onConnected);
    expect(connect).not.toHaveBeenCalled();
    expect(onConnected).not.toHaveBeenCalled();
  });

  test("a driver whose connection is not alive is reconnected and reported", async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const onConnected = jest.fn();
    await reconnectAllDevices(runtimeWith({ "d-a": { isConnectionAlive: async () => false, connect } }), [device("a")], onConnected);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(onConnected).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  test("a driver with no liveness check is reconnected as before", async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    await reconnectAllDevices(runtimeWith({ "d-a": { connect } }), [device("a")], jest.fn());
    expect(connect).toHaveBeenCalledTimes(1);
  });

  test("one device failing to reconnect never stops the others", async () => {
    const good = jest.fn().mockResolvedValue(undefined);
    const bad = jest.fn().mockRejectedValue(new Error("unreachable"));
    const onConnected = jest.fn();
    await reconnectAllDevices(runtimeWith({ "d-a": { connect: bad }, "d-b": { connect: good } }), [device("a"), device("b")], onConnected);
    expect(good).toHaveBeenCalled();
    expect(onConnected).toHaveBeenCalledTimes(1);
  });
});
