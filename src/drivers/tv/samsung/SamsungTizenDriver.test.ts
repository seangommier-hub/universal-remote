import { SamsungTizenDriver, SAMSUNG_TIZEN_DRIVER_ID } from "./SamsungTizenDriver";
import { installMockWebSocket, MockWebSocket } from "../../../testUtils/mockWebSocket";
import { Device } from "../../../core/types/Device";

const device: Device = {
  id: "samsung-1",
  name: "Living Room Samsung",
  category: "tv",
  manufacturer: "Samsung",
  driverId: SAMSUNG_TIZEN_DRIVER_ID,
  capabilities: [],
  config: { ipAddress: "192.168.1.60" },
};

async function connectDriver(driver: SamsungTizenDriver): Promise<void> {
  const connectPromise = driver.connect(device);
  MockWebSocket.latest().simulateMessage({ event: "ms.channel.connect", data: {} });
  await connectPromise;
}

describe("SamsungTizenDriver", () => {
  let driver: SamsungTizenDriver;

  beforeEach(() => {
    installMockWebSocket();
    driver = new SamsungTizenDriver();
  });

  test("declares nav/menu capabilities but not inputSelection or setVolume (protocol can't do either)", () => {
    const caps = driver.getCapabilities();
    expect(caps).toContain("directionalNavigation");
    expect(caps).not.toContain("inputSelection");
    expect(caps).not.toContain("setVolume");
  });

  test("connect() completes once the TV sends ms.channel.connect", async () => {
    await connectDriver(driver);
    const state = await driver.getState(device);
    expect(state.connection).toBe("connected");
  });

  test("executeCommand throws if the device was never connected", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow(/not connected/);
  });

  test("power command sends KEY_POWER and optimistically flips the cached power state", async () => {
    await connectDriver(driver);

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    const sent = JSON.parse(MockWebSocket.latest().sentMessages[0]);
    expect(sent.params.DataOfCmd).toBe("KEY_POWER");
    expect(result.state?.power).toBe("on");

    const second = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });
    expect(second.state?.power).toBe("off");
  });

  test("directionalNavigation maps direction args to the correct key code", async () => {
    await connectDriver(driver);

    await driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation", args: { direction: "left" } });

    const sent = JSON.parse(MockWebSocket.latest().sentMessages[0]);
    expect(sent.params.DataOfCmd).toBe("KEY_LEFT");
  });

  test("directionalNavigation without a valid direction throws", async () => {
    await connectDriver(driver);
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation" })).rejects.toThrow();
  });
});
