/** @jest-environment node */
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";
import { CommandEngine } from "../src/core/engine/CommandEngine";
import { DeviceDriver, StateChangeListener } from "../src/core/drivers/DeviceDriver";
import { DriverRegistry } from "../src/core/drivers/DriverRegistry";
import { DeviceRegistry } from "../src/core/registry/DeviceRegistry";
import { StateStore } from "../src/core/state/StateStore";
import { Command } from "../src/core/types/Command";
import { Device } from "../src/core/types/Device";
import { DeviceState } from "../src/core/types/DeviceState";
import { HearthRuntime } from "../src/runtime/bootstrap";
import { DeviceExecutor } from "./executor";
import { LOOPBACK_HOST, createRunnerServer } from "./httpApi";

class FakeDriver implements DeviceDriver {
  id = "fake";
  displayName = "Fake";
  connectCalls = 0;
  failConnect = false;
  private listeners: StateChangeListener[] = [];
  private state: DeviceState = { connection: "disconnected", values: {}, lastUpdated: 0 };

  getCapabilities() {
    return ["volumeUp" as const];
  }

  async connect(device: Device): Promise<void> {
    this.connectCalls += 1;
    if (this.failConnect) throw new Error("unreachable");
    this.state = { connection: "connected", values: {}, lastUpdated: 1 };
    this.listeners.forEach((listener) => listener(device.id, this.state));
  }

  async disconnect(): Promise<void> {}

  async getState(): Promise<DeviceState> {
    return this.state;
  }

  async executeCommand(device: Device, command: Command) {
    return { success: true, deviceId: device.id, capability: command.capability, timestamp: 1, state: { volume: 11 } };
  }

  subscribeToState(_device: Device, listener: StateChangeListener): () => void {
    this.listeners.push(listener);
    return () => undefined;
  }
}

const DEVICE: Device = { id: "tv", name: "TV", category: "tv", manufacturer: "x", driverId: "fake", capabilities: ["volumeUp"] };

function buildExecutor(driver: FakeDriver): DeviceExecutor {
  const deviceRegistry = new DeviceRegistry();
  const driverRegistry = new DriverRegistry();
  const stateStore = new StateStore();
  driverRegistry.register(driver);
  const runtime: HearthRuntime = { deviceRegistry, driverRegistry, stateStore, commandEngine: new CommandEngine(deviceRegistry, driverRegistry, stateStore) };
  return new DeviceExecutor(runtime, [DEVICE]);
}

describe("DeviceExecutor", () => {
  it("connects on first use, then runs the command and records state", async () => {
    const driver = new FakeDriver();
    const executor = buildExecutor(driver);
    const result = await executor.execute("tv", "volumeUp");
    expect(result.success).toBe(true);
    expect(driver.connectCalls).toBe(1);
    expect(executor.getState("tv")?.values.volume).toBe(11);
  });

  it("does not reconnect a device that is already connected", async () => {
    const driver = new FakeDriver();
    const executor = buildExecutor(driver);
    await executor.execute("tv", "volumeUp");
    await executor.execute("tv", "volumeUp");
    expect(driver.connectCalls).toBe(1);
  });

  it("returns a driver_error result, not a throw, when connecting fails", async () => {
    const driver = new FakeDriver();
    driver.failConnect = true;
    const result = await buildExecutor(driver).execute("tv", "volumeUp");
    expect(result).toMatchObject({ success: false, error: { code: "driver_error", message: "unreachable" } });
  });

  it("reports device_not_found for an unknown device", async () => {
    const result = await buildExecutor(new FakeDriver()).execute("nope", "volumeUp");
    expect(result.error?.code).toBe("device_not_found");
  });

  it("returns null state for an unknown device", () => {
    expect(buildExecutor(new FakeDriver()).getState("nope")).toBeNull();
  });
});

// jest-expo replaces the global fetch, so the API tests talk to the real server through node:http.
function httpJson(base: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${base}${path}`, { method }, (response) => {
      let text = "";
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, json: JSON.parse(text) }));
    });
    request.on("error", reject);
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

describe("runner HTTP API", () => {
  async function withServer<T>(run: (base: string) => Promise<T>): Promise<T> {
    const server = createRunnerServer(buildExecutor(new FakeDriver()));
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_HOST, resolve));
    try {
      return await run(`http://${LOOPBACK_HOST}:${(server.address() as AddressInfo).port}`);
    } finally {
      server.close();
    }
  }

  it("POST /execute runs a command and returns the CommandResult", async () => {
    await withServer(async (base) => {
      const { status, json } = await httpJson(base, "POST", "/execute", { device: "tv", command: { capability: "volumeUp" } });
      expect(status).toBe(200);
      expect(json).toMatchObject({ success: true, deviceId: "tv" });
    });
  });

  it("POST /execute rejects a malformed body with 400", async () => {
    await withServer(async (base) => {
      expect((await httpJson(base, "POST", "/execute", { device: "tv" })).status).toBe(400);
    });
  });

  it("GET /state/:id returns state, and 404 for unknown devices", async () => {
    await withServer(async (base) => {
      expect((await httpJson(base, "GET", "/state/tv")).status).toBe(200);
      expect((await httpJson(base, "GET", "/state/nope")).status).toBe(404);
    });
  });
});
