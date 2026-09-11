import { SamsungTizenDriver, SAMSUNG_TIZEN_DRIVER_ID } from "./SamsungTizenDriver";
import { flushMicrotasks, installMockWebSocket, MockWebSocket } from "../../../testUtils/mockWebSocket";
import { Device } from "../../../core/types/Device";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

jest.mock("../../../discovery/familyCommandCenterConfig");
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

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
  const socket = MockWebSocket.latest();
  socket.simulateOpen();
  await flushMicrotasks();
  socket.simulateMessage({ event: "ms.channel.connect", data: {} });
  await connectPromise;
}

describe("SamsungTizenDriver", () => {
  let driver: SamsungTizenDriver;

  beforeEach(() => {
    installMockWebSocket();
    driver = new SamsungTizenDriver();
    mockLoadConfig.mockReset();
    global.fetch = jest.fn();
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

  test("settings and sleepTimer send the real, verified Tizen key codes KEY_TOOLS and KEY_SLEEP (real-hardware ask, 2026-09-10)", async () => {
    await connectDriver(driver);

    await driver.executeCommand(device, { deviceId: device.id, capability: "settings" });
    expect(JSON.parse(MockWebSocket.latest().sentMessages[0]).params.DataOfCmd).toBe("KEY_TOOLS");

    await driver.executeCommand(device, { deviceId: device.id, capability: "sleepTimer" });
    expect(JSON.parse(MockWebSocket.latest().sentMessages[1]).params.DataOfCmd).toBe("KEY_SLEEP");
  });

  test("openSourceList sends the real, verified Tizen key code KEY_SOURCE (real-hardware research, 2026-09-10)", async () => {
    await connectDriver(driver);

    await driver.executeCommand(device, { deviceId: device.id, capability: "openSourceList" });

    expect(JSON.parse(MockWebSocket.latest().sentMessages[0]).params.DataOfCmd).toBe("KEY_SOURCE");
  });

  test("setChannel sends KEY_0..KEY_9 for each digit, in order, and records the channel", async () => {
    await connectDriver(driver);
    const socket = MockWebSocket.latest();

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: 142 } });

    const sentKeys = socket.sentMessages.map((raw) => JSON.parse(raw).params.DataOfCmd);
    expect(sentKeys).toEqual(["KEY_1", "KEY_4", "KEY_2"]);
    expect(result.state?.channel).toBe(142);
  }, 10000);

  test("setChannel rejects a non-numeric channel arg without sending anything", async () => {
    await connectDriver(driver);
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setChannel", args: { channel: "12" } })).rejects.toThrow(
      /numeric 'channel'/
    );
    expect(MockWebSocket.latest().sentMessages).toHaveLength(0);
  });

  test("a connect() that fails outright still gets auto-retried in the background (ADR-HEARTH-017 update, 2026-09-10)", async () => {
    const firstAttempt = driver.connect(device);
    MockWebSocket.latest().simulateError();
    await expect(firstAttempt).rejects.toThrow();
    expect((await driver.getState(device)).connection).not.toBe("connected");

    await new Promise((resolve) => setTimeout(resolve, 2100));
    const secondSocket = MockWebSocket.latest();
    secondSocket.simulateOpen();
    await flushMicrotasks();
    secondSocket.simulateMessage({ event: "ms.channel.connect", data: {} });
    await flushMicrotasks();

    expect((await driver.getState(device)).connection).toBe("connected");
  }, 10000);

  describe("re-discovery after a network change (ADR-HEARTH-017 update, 2026-09-10)", () => {
    const deviceWithMac: Device = { ...device, config: { ipAddress: "192.168.1.60", hwaddr: "AA:BB:CC:DD:EE:FF" } };

    test("re-locates the device by MAC through Family Command Center and connects at its new address", async () => {
      mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "fcc-token" });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ devices: [{ hwaddr: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.219" }] }),
      });

      const connectPromise = driver.connect(deviceWithMac);
      const directSocket = MockWebSocket.latest();
      directSocket.simulateError();
      await flushMicrotasks();
      const relaySocket = MockWebSocket.latest();
      expect(relaySocket).not.toBe(directSocket);
      relaySocket.simulateError();
      await flushMicrotasks(20);

      const retrySocket = MockWebSocket.latest();
      expect(retrySocket.url).toContain("192.168.1.219");
      retrySocket.simulateOpen();
      await flushMicrotasks();
      retrySocket.simulateMessage({ event: "ms.channel.connect", data: {} });
      await flushMicrotasks();

      await connectPromise;
      expect((await driver.getState(deviceWithMac)).connection).toBe("connected");
      expect(deviceWithMac.config?.ipAddress).toBe("192.168.1.219");
    });

    // Parity with LgWebOsDriver.test.ts's identical case (real-hardware finding, 2026-09-10): the
    // old instanceof-gated re-discovery missed a stale IP where something else now answers the
    // socket but never completes the pairing handshake — a plain timeout, not
    // SamsungUnreachableError. Own device object, since the first test above already mutates
    // `deviceWithMac` in place to "192.168.1.219".
    test("re-discovery ALSO triggers on a pairing-timeout failure at the stale address, not just an outright-unreachable one", async () => {
      jest.useFakeTimers();
      try {
        const deviceAtStaleIp: Device = { ...device, config: { ipAddress: "192.168.1.60", hwaddr: "AA:BB:CC:DD:EE:FF" } };
        mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "fcc-token" });
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ devices: [{ hwaddr: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.219" }] }),
        });

        const connectPromise = driver.connect(deviceAtStaleIp);

        const staleSocket = MockWebSocket.latest();
        staleSocket.simulateOpen(); // opens fine — something else answers, not the TV
        await flushMicrotasks();
        jest.advanceTimersByTime(30000); // ms.channel.connect never arrives — pairing-timeout, not SamsungUnreachableError
        await flushMicrotasks(20);

        const retrySocket = MockWebSocket.latest();
        expect(retrySocket.url).toContain("192.168.1.219");
        retrySocket.simulateOpen();
        await flushMicrotasks();
        retrySocket.simulateMessage({ event: "ms.channel.connect", data: {} });
        await flushMicrotasks();

        await connectPromise;
        expect((await driver.getState(deviceAtStaleIp)).connection).toBe("connected");
        expect(deviceAtStaleIp.config?.ipAddress).toBe("192.168.1.219");
      } finally {
        jest.useRealTimers();
      }
    });

    test("a device with no saved hwaddr just fails normally — no lookup attempted", async () => {
      const manualDevice: Device = { ...device, config: { ipAddress: "192.168.1.60" } };

      const connectPromise = driver.connect(manualDevice);
      MockWebSocket.latest().simulateError();
      await flushMicrotasks();

      await expect(connectPromise).rejects.toThrow();
      expect(global.fetch).not.toHaveBeenCalled();
      await driver.disconnect(manualDevice); // cancel the scheduled retry so it can't leak into a later test
    });
  });
});
