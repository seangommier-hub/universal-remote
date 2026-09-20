import { SamsungTizenDriver, SAMSUNG_TIZEN_DRIVER_ID } from "./SamsungTizenDriver";
import { flushMicrotasks, installMockWebSocket, MockWebSocket } from "../../../testUtils/mockWebSocket";
import { Device } from "../../../core/types/Device";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";
import { sendWakeOnLan } from "../../../core/network/wakeOnLan";

jest.mock("../../../discovery/familyCommandCenterConfig");
jest.mock("../../../core/network/wakeOnLan");
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;
const mockSendWakeOnLan = sendWakeOnLan as jest.MockedFunction<typeof sendWakeOnLan>;

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
    mockSendWakeOnLan.mockReset().mockResolvedValue(undefined);
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

  // ADR-HEARTH-096: a separate, unauthenticated HTTP call (not part of the WebSocket handshake
  // connectDriver() drives) — mocked here since this is the one test that cares about its result;
  // every other test's bare, unmocked global.fetch degrades this to undefined gracefully instead
  // (confirmed by the full suite passing unchanged after this call became awaited).
  test("connect() surfaces the TV's real device name into state.values.deviceName", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ device: { name: "[TV] Living Room Samsung" } }) } as Response);
    await connectDriver(driver);
    const state = await driver.getState(device);
    expect(state.values.deviceName).toBe("Living Room Samsung");
  });

  test("connect() writes the token it receives into device.config, so App.tsx can persist it and skip the on-screen prompt next time (real-hardware ask, restated 2026-09-17)", async () => {
    const connectPromise = driver.connect(device);
    const socket = MockWebSocket.latest();
    socket.simulateOpen();
    await flushMicrotasks();
    socket.simulateMessage({ event: "ms.channel.connect", data: { token: "test-token" } });
    await connectPromise;
    expect(device.config?.token).toBe("test-token");
    delete device.config?.token; // this `device` object is shared across this file's tests
  });

  test("a saved token is sent back as a query param, and the TV connecting without re-issuing one still keeps it saved", async () => {
    device.config = { ...device.config, token: "known-token" };
    const connectPromise = driver.connect(device);
    const socket = MockWebSocket.latest();
    expect(socket.url).toContain("&token=known-token");
    socket.simulateOpen();
    await flushMicrotasks();
    socket.simulateMessage({ event: "ms.channel.connect", data: {} }); // no new token — TV just recognized the known one
    await connectPromise;
    expect(device.config?.token).toBe("known-token"); // not lost just because the TV didn't repeat it
    delete device.config?.token;
  });

  test("executeCommand throws if the device was never connected", async () => {
    // "power" is deliberately excluded here (see the Wake-on-LAN tests below) — every other
    // capability still requires a live connection exactly as before.
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" })).rejects.toThrow(/not connected/);
  });

  // ADR-HEARTH-102: KEY_POWER can only reach the TV over the same WebSocket every other command
  // uses — no client means no socket, which for this protocol means the TV is genuinely off, not
  // just slow to answer. "power" is the one capability that has to work in exactly that state.
  test("power without a live connection falls back to a real Wake-on-LAN packet using the device's saved MAC", async () => {
    const offDevice: Device = { ...device, config: { ipAddress: "192.168.1.60", hwaddr: "AA:BB:CC:DD:EE:FF" } };

    const result = await driver.executeCommand(offDevice, { deviceId: offDevice.id, capability: "power" });

    expect(mockSendWakeOnLan).toHaveBeenCalledWith("AA:BB:CC:DD:EE:FF");
    expect(result.success).toBe(true);
    expect(result.state?.lastAction).toBe("power");
  });

  test("power without a live connection and no known MAC fails clearly rather than silently no-opping", async () => {
    const offDevice: Device = { ...device, config: { ipAddress: "192.168.1.60" } };
    mockLoadConfig.mockResolvedValue(null); // Family Command Center unconfigured -- findMacByIp can't fall back either

    await expect(driver.executeCommand(offDevice, { deviceId: offDevice.id, capability: "power" })).rejects.toThrow(/no known MAC address/);
    expect(mockSendWakeOnLan).not.toHaveBeenCalled();
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

    test("a device with no saved hwaddr and no Family Command Center configured just fails normally — nothing to look up", async () => {
      const manualDevice: Device = { ...device, config: { ipAddress: "192.168.1.60" } };

      const connectPromise = driver.connect(manualDevice);
      MockWebSocket.latest().simulateError();
      await flushMicrotasks();

      await expect(connectPromise).rejects.toThrow();
      expect(global.fetch).not.toHaveBeenCalled(); // FCC isn't configured (mockLoadConfig defaults unconfigured) — nothing to call
      await driver.disconnect(manualDevice); // cancel the scheduled retry so it can't leak into a later test
    });

    // See LgWebOsDriver.test.ts's identical case: a device discovered before hwaddr-saving
    // existed has no MAC to re-locate by — falls back to matching its own `name` (set from the
    // Center's reported hostname at discovery time) against the Center's current inventory.
    test("a device with no saved hwaddr falls back to a name-based lookup and re-locates itself", async () => {
      const deviceWithNoMac: Device = { ...device, name: "SamsungTV.lan", config: { ipAddress: "192.168.1.60" } };
      mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "fcc-token" });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ devices: [{ hwaddr: "11:22:33:44:55:66", ip: "192.168.1.219", name: "SamsungTV.lan" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ devices: [{ hwaddr: "11:22:33:44:55:66", ip: "192.168.1.219", name: "SamsungTV.lan" }] }),
        });

      const connectPromise = driver.connect(deviceWithNoMac);
      const directSocket = MockWebSocket.latest();
      directSocket.simulateError();
      await flushMicrotasks();
      const relaySocket = MockWebSocket.latest();
      relaySocket.simulateError();
      await flushMicrotasks(20);

      const retrySocket = MockWebSocket.latest();
      expect(retrySocket.url).toContain("192.168.1.219");
      retrySocket.simulateOpen();
      await flushMicrotasks();
      retrySocket.simulateMessage({ event: "ms.channel.connect", data: {} });
      await flushMicrotasks();

      await connectPromise;
      expect((await driver.getState(deviceWithNoMac)).connection).toBe("connected");
      expect(deviceWithNoMac.config?.ipAddress).toBe("192.168.1.219");
      expect(deviceWithNoMac.config?.hwaddr).toBe("11:22:33:44:55:66");
    });
  });
});
