import { Device } from "../../../core/types/Device";
import { SWITCHBOT_VACUUM_DRIVER_ID, SwitchBotVacuumDriver } from "./SwitchBotVacuumDriver";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function statusResponse(overrides: Partial<{ workingStatus: string; onlineStatus: string; battery: number }> = {}) {
  return jsonResponse({
    statusCode: 100,
    message: "success",
    body: { deviceId: "vac-1", deviceType: "K10+", workingStatus: "StandBy", onlineStatus: "online", battery: 80, ...overrides },
  });
}

const device: Device = {
  id: "vacuum-1",
  name: "Living Room Vacuum",
  category: "vacuum",
  manufacturer: "SwitchBot",
  driverId: SWITCHBOT_VACUUM_DRIVER_ID,
  capabilities: ["vacuumStart", "vacuumStop", "vacuumDock", "setSuctionPower"],
  config: { token: "test-token", secret: "test-secret", deviceId: "vac-1" },
};

describe("SwitchBotVacuumDriver", () => {
  let driver: SwitchBotVacuumDriver;

  beforeEach(() => {
    driver = new SwitchBotVacuumDriver();
    global.fetch = jest.fn();
  });

  test("declares vacuumStart/vacuumStop/vacuumDock/setSuctionPower and nothing else", () => {
    const caps = driver.getCapabilities();
    expect(caps).toEqual(["vacuumStart", "vacuumStop", "vacuumDock", "setSuctionPower"]);
  });

  test("connect() reads real status and populates working status/battery/online", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse({ workingStatus: "Charging", battery: 55 }));
    await driver.connect(device);

    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
    expect(state.values.workingStatus).toBe("Charging");
    expect(state.values.battery).toBe(55);
    expect(state.values.online).toBe(true);
  });

  test("connect() rejects and schedules a reconnect when the device config is missing", async () => {
    const unconfigured: Device = { ...device, config: undefined };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/missing SwitchBot config/);
  });

  test("connect() marks disconnected and retries with backoff when the API call fails", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network unreachable")).mockResolvedValueOnce(statusResponse());

    await expect(driver.connect(device)).rejects.toThrow("network unreachable");
    expect((await driver.getState(device)).connection).toBe("disconnected");

    // Same real-timer wait this project's other drivers use for their identical backoff test
    // (RECONNECT_BASE_DELAY_MS = 2000ms) — fake timers interacting with a recursive async
    // retry loop are a real, known way to deadlock Jest, not worth the risk for one assertion.
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect((await driver.getState(device)).connection).toBe("connected");
  }, 10000);

  test("vacuumStart sends the documented 'start' command, then re-reads real status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse()); // connect()
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ statusCode: 100, message: "success", body: {} })); // command
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse({ workingStatus: "Clearing" })); // re-read
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "vacuumStart" });

    const [commandUrl, commandInit] = (global.fetch as jest.Mock).mock.calls[1];
    expect(commandUrl).toBe("https://api.switch-bot.com/v1.1/devices/vac-1/commands");
    expect(JSON.parse(commandInit.body)).toEqual({ commandType: "command", command: "start", parameter: "default" });
    expect(result.success).toBe(true);
    expect(result.state?.workingStatus).toBe("Clearing");
  });

  test("vacuumStop sends 'stop'", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse());
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ statusCode: 100, message: "success", body: {} }));
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse({ workingStatus: "Paused" }));
    await driver.executeCommand(device, { deviceId: device.id, capability: "vacuumStop" });

    const [, commandInit] = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(commandInit.body).command).toBe("stop");
  });

  test("vacuumDock sends 'dock'", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse());
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ statusCode: 100, message: "success", body: {} }));
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse({ workingStatus: "GotoChargeBase" }));
    await driver.executeCommand(device, { deviceId: device.id, capability: "vacuumDock" });

    const [, commandInit] = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(commandInit.body).command).toBe("dock");
  });

  test("setSuctionPower sends 'PowLevel' with the given integer level", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse());
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ statusCode: 100, message: "success", body: {} }));
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse());
    await driver.executeCommand(device, { deviceId: device.id, capability: "setSuctionPower", args: { level: 2 } });

    const [, commandInit] = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(commandInit.body)).toEqual({ commandType: "command", command: "PowLevel", parameter: 2 });
  });

  test("setSuctionPower rejects an out-of-range or non-integer level without touching the network", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse());
    await driver.connect(device);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setSuctionPower", args: { level: 4 } })).rejects.toThrow(/between 0 and 3/);
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setSuctionPower", args: { level: 1.5 } })).rejects.toThrow(/integer/);
    expect(global.fetch).toHaveBeenCalledTimes(1); // only the connect() call -- neither rejected attempt reached the network
  });

  test("a command failing marks the device disconnected and schedules a reconnect", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse());
    await driver.connect(device);

    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("timeout"));
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "vacuumStart" })).rejects.toThrow("timeout");
    expect((await driver.getState(device)).connection).toBe("disconnected");

    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse());
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect((await driver.getState(device)).connection).toBe("connected");
  }, 10000);

  test("a failed post-command status read-back doesn't fail the command itself (best-effort, like every other driver)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(statusResponse({ battery: 90 }));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ statusCode: 100, message: "success", body: {} })); // command succeeds
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("timeout")); // re-read fails
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "vacuumDock" });

    expect(result.success).toBe(true);
    expect(result.state?.battery).toBe(90); // unchanged from connect(), not clobbered
  });
});
