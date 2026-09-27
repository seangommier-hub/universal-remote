import { SonyBraviaDriver } from "./SonyBraviaDriver";
import { Device } from "../../../core/types/Device";
import { sendWakeOnLan } from "../../../core/network/wakeOnLan";
import { resetRelayNecessityCacheForTests } from "../../../core/network/httpRelayFallback";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";
import { WAKE_BURST_INTERVAL_MS, WAKE_BURST_WINDOW_MS } from "../../shared/wakeBurst";

jest.mock("../../../core/network/wakeOnLan");
const mockSendWakeOnLan = sendWakeOnLan as jest.MockedFunction<typeof sendWakeOnLan>;

jest.mock("../../../discovery/familyCommandCenterConfig", () => ({
  loadFamilyCommandCenterConfig: jest.fn(),
}));
const mockLoadConfig = loadFamilyCommandCenterConfig as jest.MockedFunction<typeof loadFamilyCommandCenterConfig>;

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const powerStatusResponse = (status: "active" | "standby") => jsonResponse({ result: [{ status }], id: 1 });
const volumeInfoResponse = (volume: number, mute: boolean) =>
  jsonResponse({ result: [{ target: "speaker", volume, mute, maxVolume: 100, minVolume: 0 }], id: 1 });
const emptyResultResponse = () => jsonResponse({ result: [], id: 1 });
const externalInputsResponse = (inputs: { uri: string; title: string }[]) => jsonResponse({ result: [inputs], id: 1 });
const systemInformationResponse = (name: string) => jsonResponse({ result: [{ name }], id: 1 });

const device: Device = {
  id: "sony-1",
  name: "Living Room Sony",
  category: "tv",
  manufacturer: "Sony",
  driverId: "sony-bravia",
  capabilities: [],
  config: { ipAddress: "192.168.1.50", psk: "secret-psk" },
};

describe("SonyBraviaDriver", () => {
  let driver: SonyBraviaDriver;

  beforeEach(() => {
    driver = new SonyBraviaDriver();
    global.fetch = jest.fn();
    mockSendWakeOnLan.mockReset().mockResolvedValue(undefined);
    mockLoadConfig.mockReset(); // defaults to unconfigured — matches every existing test's "no relay/self-heal lookup" world unless a test opts in
    resetRelayNecessityCacheForTests();
  });

  afterEach(async () => {
    await driver.disconnect(device); // cancels any Wake-on-LAN reconnect burst (ADR-HEARTH-144) so its timer cannot leak into the next test
  });

  test("declares REST-API capabilities plus IRCC-IP nav/select/back/home (ADR-HEARTH-071) — but not menu or textEntry, which neither protocol supports", () => {
    const caps = driver.getCapabilities();
    expect(caps).toEqual(["power", "volumeUp", "volumeDown", "setVolume", "mute", "inputSelection", "directionalNavigation", "select", "back", "home"]);
    expect(caps).not.toContain("menu");
    expect(caps).not.toContain("textEntry");
  });

  test("connect() reads real power + volume state from the TV", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(powerStatusResponse("standby"))
      .mockResolvedValueOnce(volumeInfoResponse(20, false))
      .mockResolvedValueOnce(externalInputsResponse([]));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values).toEqual({ power: "off", volume: 20, muted: false });
  });

  test("connect() also reads the real external input list (real-hardware research, 2026-09-10)", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(powerStatusResponse("active"))
      .mockResolvedValueOnce(volumeInfoResponse(20, false))
      .mockResolvedValueOnce(
        externalInputsResponse([
          { uri: "extInput:hdmi?port=1", title: "HDMI 1" },
          { uri: "extInput:hdmi?port=2", title: "HDMI 2" },
        ])
      );

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.values.inputs).toEqual([
      { id: "extInput:hdmi?port=1", label: "HDMI 1" },
      { id: "extInput:hdmi?port=2", label: "HDMI 2" },
    ]);
  });

  // ADR-HEARTH-096: verified directly against Sony's own BRAVIA Professional Displays Knowledge
  // Center — getSystemInformation's "name" field is the user-set TV name, present since v1.0.
  test("connect() surfaces the TV's real device name into state.values.deviceName", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(powerStatusResponse("active"))
      .mockResolvedValueOnce(volumeInfoResponse(20, false))
      .mockResolvedValueOnce(externalInputsResponse([]))
      .mockResolvedValueOnce(systemInformationResponse("Living Room Sony"));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.values.deviceName).toBe("Living Room Sony");
  });

  test("a command run after connect() doesn't wipe the input list back out of state (real bug found alongside this feature)", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(powerStatusResponse("active"))
      .mockResolvedValueOnce(volumeInfoResponse(20, false))
      .mockResolvedValueOnce(externalInputsResponse([{ uri: "extInput:hdmi?port=1", title: "HDMI 1" }]));
    await driver.connect(device);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(emptyResultResponse()) // setAudioVolume
      .mockResolvedValueOnce(powerStatusResponse("active")) // refreshState after the command
      .mockResolvedValueOnce(volumeInfoResponse(22, false));
    await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    const state = await driver.getState(device);
    expect(state.values.inputs).toEqual([{ id: "extInput:hdmi?port=1", label: "HDMI 1" }]);
    expect(state.values.volume).toBe(22); // refreshState's own fields still update correctly alongside the preserved ones
  });

  // ADR-HEARTH-179: power reads current status (to know which way to toggle), sends the opposite,
  // and now reports the result optimistically from those two already-made calls — no third,
  // verification read-back the way this used to (a full refreshState() after every command).
  test("power command reads current status, sends the opposite, and reports the result with no re-read", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(powerStatusResponse("standby")) // applyCommand's read
      .mockResolvedValueOnce(emptyResultResponse()); // setPowerStatus

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.success).toBe(true);
    expect(result.state?.power).toBe("on");
    const setPowerCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(setPowerCall[1].body)).toMatchObject({ method: "setPowerStatus", params: [{ status: true }] });
    expect(global.fetch).toHaveBeenCalledTimes(2); // the read + the set — no refreshState afterward
  });

  // ADR-HEARTH-102: unlike LG/Samsung, Sony has no persistent connection to check for absence —
  // every call is a fresh REST request, so "the TV is genuinely off" surfaces here as
  // getPowerStatus itself throwing (both the direct call and the Family Command Center relay
  // fallback failing, since nothing is configured/reachable). Wake-on-LAN is the only thing that
  // can still reach it from that state.
  test("power falls back to a real Wake-on-LAN packet when the TV's REST API is entirely unreachable", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network unreachable"));
    const offDevice: Device = { ...device, config: { ...device.config, hwaddr: "11:22:33:44:55:66" } };

    const result = await driver.executeCommand(offDevice, { deviceId: offDevice.id, capability: "power" });

    expect(mockSendWakeOnLan).toHaveBeenCalledWith("11:22:33:44:55:66");
    expect(result.success).toBe(true);
    expect(result.state?.lastAction).toBe("power");
  });

  test("power falls back and fails clearly when the TV is unreachable AND no MAC address is known", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network unreachable"));

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow(/no known MAC address/);
    expect(mockSendWakeOnLan).not.toHaveBeenCalled();
  });

  test("a real API error while the TV IS reachable (e.g. a rejected PSK) still surfaces normally, not as a Wake-on-LAN fallback", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) } as Response);

    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow(/HTTP 403/);
    expect(mockSendWakeOnLan).not.toHaveBeenCalled();
  });

  // Real gap found live (2026-09-21, ADR-HEARTH-119): Sony was the first TV driver built (Phase
  // 1) and never got the MAC-based self-healing LG/Samsung/Roku already have — a Sony TV that
  // moves to a different network kept retrying the same dead IP forever.
  //
  // URL-based fetch routing (not sequential mockResolvedValueOnce chaining, unlike this driver's
  // other tests) is used here because refreshState's power+volume reads fire in parallel
  // (Promise.all), so the exact order the resulting fetch calls land in isn't the deterministic
  // single-call sequence RokuEcpDriver.test.ts's equivalent tests can rely on.
  describe("re-discovery after a network change", () => {
    const OLD_IP = "192.168.1.50";
    const NEW_IP = "192.168.1.218";

    function freshDeviceWithMac(): Device {
      return { ...device, config: { ipAddress: OLD_IP, psk: "secret-psk", hwaddr: "11:22:33:44:55:66" } };
    }

    function mockFetchRoutedByUrl(handler: (url: string) => Response | Promise<Response> | undefined): void {
      (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
        const response = await handler(url);
        if (response) return response;
        throw new Error(`unexpected fetch in test: ${url}`);
      });
    }

    test("re-locates the device by MAC through Family Command Center and connects at its new address", async () => {
      mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "fcc-token" });
      mockFetchRoutedByUrl((url) => {
        if (url.includes(OLD_IP)) throw new Error("Network request failed"); // stale IP -- never answers, direct or relayed
        if (url.includes("/relay/http")) return { ok: false, status: 502, json: async () => ({}), text: async () => "" } as Response;
        if (url.includes("/api/integrations/hearth/devices")) {
          return { ok: true, status: 200, json: async () => ({ devices: [{ hwaddr: "11:22:33:44:55:66", ip: NEW_IP, name: null }] }) } as Response;
        }
        if (url.includes(NEW_IP) && url.includes("/sony/system")) return powerStatusResponse("active");
        if (url.includes(NEW_IP) && url.includes("/sony/audio")) return volumeInfoResponse(15, false);
        return undefined;
      });

      const deviceWithMac = freshDeviceWithMac();
      await driver.connect(deviceWithMac);

      expect(deviceWithMac.config?.ipAddress).toBe(NEW_IP); // persisted onto the device object, same as LG/Samsung/Roku
      const state = await driver.getState(deviceWithMac);
      expect(state.connection).toBe("connected");
      expect(state.values.power).toBe("on");
    });

    test("a genuinely dead device (no better address found) still surfaces a real failure, not a silent hang", async () => {
      mockLoadConfig.mockResolvedValue(null); // Family Command Center unconfigured -- no relay fallback and no self-heal lookup possible
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network request failed"));

      const deviceWithMac = freshDeviceWithMac();
      await expect(driver.connect(deviceWithMac)).rejects.toThrow();
      expect(deviceWithMac.config?.ipAddress).toBe(OLD_IP); // untouched -- nothing better was found
      expect((await driver.getState(deviceWithMac)).connection).toBe("disconnected");
    });

    test("a device with no saved hwaddr falls back to a name-based lookup and re-locates itself", async () => {
      const deviceWithNoMac: Device = { ...device, name: "SonyTV.lan", config: { ipAddress: OLD_IP, psk: "secret-psk" } };
      mockLoadConfig.mockResolvedValue({ baseUrl: "http://192.168.1.172:3210", token: "fcc-token" });
      mockFetchRoutedByUrl((url) => {
        if (url.includes(OLD_IP)) throw new Error("Network request failed");
        if (url.includes("/relay/http")) return { ok: false, status: 502, json: async () => ({}), text: async () => "" } as Response;
        if (url.includes("/api/integrations/hearth/devices")) {
          return { ok: true, status: 200, json: async () => ({ devices: [{ hwaddr: "aa:bb:cc:dd:ee:ff", ip: NEW_IP, name: "SonyTV.lan" }] }) } as Response;
        }
        if (url.includes(NEW_IP) && url.includes("/sony/system")) return powerStatusResponse("active");
        if (url.includes(NEW_IP) && url.includes("/sony/audio")) return volumeInfoResponse(15, false);
        return undefined;
      });

      await driver.connect(deviceWithNoMac);

      expect(deviceWithNoMac.config?.ipAddress).toBe(NEW_IP);
      expect(deviceWithNoMac.config?.hwaddr).toBe("aa:bb:cc:dd:ee:ff"); // backfilled for next time
    });
  });

  test("volumeUp sends a relative +2 and reports the actual resulting volume, not an assumed one", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(emptyResultResponse()) // setAudioVolume
      .mockResolvedValueOnce(powerStatusResponse("active"))
      .mockResolvedValueOnce(volumeInfoResponse(22, false)); // TV's actual resulting volume

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "volumeUp" });

    const volumeCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(volumeCall[1].body)).toMatchObject({ method: "setAudioVolume", params: [{ target: "speaker", volume: "+2" }] });
    expect(result.state?.volume).toBe(22);
  });

  // ADR-HEARTH-179: mute's own pre-toggle getVolumeInformation read is load-bearing (setAudioMute
  // takes an explicit boolean), not a verification read-back — it already carries the current
  // volume too, so no second REST call is needed to report the result.
  test("mute reads current state once to know which way to toggle, then reports optimistically with no second read", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(volumeInfoResponse(20, false)).mockResolvedValueOnce(emptyResultResponse());

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "mute" });

    const setMuteCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(setMuteCall[1].body)).toMatchObject({ method: "setAudioMute", params: [{ status: true }] });
    expect(result.state?.muted).toBe(true);
    expect(result.state?.volume).toBe(20); // carried through from the load-bearing read, not a second call
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("inputSelection maps 'hdmi2' to the documented extInput URI, with no follow-up read (ADR-HEARTH-179 — inputSelection doesn't change power/volume)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(emptyResultResponse());

    await driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: "hdmi2" } });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(call[1].body)).toMatchObject({ method: "setPlayContent", params: [{ uri: "extInput:hdmi?port=2" }] });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("inputSelection passes a real uri (from the dynamic input list) straight through, not re-parsed as hdmi shorthand", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(emptyResultResponse());

    await driver.executeCommand(device, { deviceId: device.id, capability: "inputSelection", args: { input: "extInput:composite?port=1" } });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(call[1].body)).toMatchObject({ method: "setPlayContent", params: [{ uri: "extInput:composite?port=1" }] });
  });

  // ADR-HEARTH-179: removing the trailing refreshState() call for power/mute/setVolume/nav also
  // removed refreshState's own generation guard against exactly this race — restored here via
  // markConnected's own guard, so a disconnect() mid-command still wins.
  test("a disconnect() that races with an in-flight command wins — its own disconnected state is not overwritten by the command's optimistic patch", async () => {
    let resolveRead!: (value: Response) => void;
    const readPromise = new Promise<Response>((resolve) => {
      resolveRead = resolve;
    });
    (global.fetch as jest.Mock).mockReturnValueOnce(readPromise).mockResolvedValueOnce(emptyResultResponse());

    const commandPromise = driver.executeCommand(device, { deviceId: device.id, capability: "power" });
    await driver.disconnect(device); // wins the race while the command's own read is still pending
    resolveRead(powerStatusResponse("standby"));

    await commandPromise;
    expect((await driver.getState(device)).connection).toBe("disconnected");
  });

  test("rejects a device with no config instead of silently doing nothing", async () => {
    const unconfigured: Device = { ...device, config: undefined };
    await expect(driver.connect(unconfigured)).rejects.toThrow(/missing Sony BRAVIA config/);
  });

  test("setVolume without a numeric arg rejects before making any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setVolume" })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ADR-HEARTH-179: an exact value we just set, unlike volumeUp/volumeDown's relative step above —
  // trust it instead of paying a read-back to confirm what's already known.
  test("setVolume sends the exact value and reports it optimistically, with no read-back", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(emptyResultResponse());

    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "setVolume", args: { volume: 42 } });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(call[1].body)).toMatchObject({ method: "setAudioVolume", params: [{ target: "speaker", volume: "42" }] });
    expect(result.state?.volume).toBe(42);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // ADR-HEARTH-071/179: directionalNavigation/select/back/home go through SonyIrccClient (a
  // separate SOAP-over-HTTP protocol from the REST calls above) — none of them changes power or
  // volume, so executeCommand no longer re-reads state afterward the way it used to; the IRCC POST
  // itself has no JSON body to assert on the way the REST calls' JSON-RPC envelopes do, so these
  // check the raw XML body.
  test("directionalNavigation sends the real, sourced IRCC code for each direction, with no follow-up read", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 } as Response); // IRCC POST

    await driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation", args: { direction: "up" } });

    const irccCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(irccCall[0]).toBe("http://192.168.1.50:80/sony/ircc");
    expect(irccCall[1].body).toContain("<IRCCCode>AAAAAQAAAAEAAAB0Aw==</IRCCCode>"); // Up
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("directionalNavigation without a valid direction rejects before any network call", async () => {
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "directionalNavigation" })).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("select sends the real Confirm IRCC code, with no follow-up read", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    await driver.executeCommand(device, { deviceId: device.id, capability: "select" });

    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain("<IRCCCode>AAAAAQAAAAEAAABlAw==</IRCCCode>");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("back sends the real Return IRCC code, with no follow-up read", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    await driver.executeCommand(device, { deviceId: device.id, capability: "back" });

    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain("<IRCCCode>AAAAAgAAAJcAAAAjAw==</IRCCCode>");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("home sends the real Home IRCC code, with no follow-up read", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    await driver.executeCommand(device, { deviceId: device.id, capability: "home" });

    expect((global.fetch as jest.Mock).mock.calls[0][1].body).toContain("<IRCCCode>AAAAAQAAAAEAAABgAw==</IRCCCode>");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ADR-HEARTH-144: after a Wake-on-LAN packet the driver retries reaching the TV on a fast fixed
// cadence instead of waiting out the slow backoff.
describe("SonyBraviaDriver reconnect burst after Wake-on-LAN", () => {
  const offDevice: Device = { ...device, config: { ...device.config, hwaddr: "11:22:33:44:55:66" } };
  const powerCommand = { deviceId: offDevice.id, capability: "power" as const };
  const burstAttempts = WAKE_BURST_WINDOW_MS / WAKE_BURST_INTERVAL_MS;
  let tvIsUp: boolean;
  let driver: SonyBraviaDriver;

  let warnSpy: jest.SpyInstance;

  // Each failed reach attempt logs one "Failed to reach" warning; counting them measures attempts even though a failed direct call makes later ones skip fetch (relay-only memory).
  function powerStatusCalls(): number {
    return warnSpy.mock.calls.filter(([message]) => String(message).includes("Failed to reach")).length;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    tvIsUp = false;
    global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
      if (!tvIsUp) throw new Error("network unreachable");
      const body = String(init?.body);
      if (body.includes("getPowerStatus")) return powerStatusResponse("active");
      if (body.includes("getVolumeInformation")) return volumeInfoResponse(12, false);
      if (body.includes("getCurrentExternalInputsStatus")) return externalInputsResponse([]);
      return systemInformationResponse("Living Room Sony");
    }) as unknown as typeof fetch;
    mockSendWakeOnLan.mockReset().mockResolvedValue(undefined);
    mockLoadConfig.mockReset();
    resetRelayNecessityCacheForTests();
    driver = new SonyBraviaDriver();
  });

  afterEach(async () => {
    await driver.disconnect(offDevice);
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  test("connects on the third fast attempt once the TV answers, then stops retrying", async () => {
    await driver.executeCommand(offDevice, powerCommand);
    expect((await driver.getState(offDevice)).connection).toBe("disconnected");
    expect((await driver.getState(offDevice)).values.waking).toBe(true);

    await jest.advanceTimersByTimeAsync(WAKE_BURST_INTERVAL_MS);
    await jest.advanceTimersByTimeAsync(WAKE_BURST_INTERVAL_MS);
    expect((await driver.getState(offDevice)).connection).toBe("disconnected");

    tvIsUp = true;
    resetRelayNecessityCacheForTests(); // a failed direct call marks the address relay-only for the session; a real reboot is not modelled by that memory
    await jest.advanceTimersByTimeAsync(WAKE_BURST_INTERVAL_MS);
    expect((await driver.getState(offDevice)).connection).toBe("connected");
    expect((await driver.getState(offDevice)).values.waking).toBe(false);

    const callsWhenConnected = powerStatusCalls();
    await jest.advanceTimersByTimeAsync(WAKE_BURST_WINDOW_MS * 2);
    expect(powerStatusCalls()).toBe(callsWhenConnected);
  });

  test("a TV that never answers ends the burst after the window and falls back to slow backoff, not a fast loop", async () => {
    await driver.executeCommand(offDevice, powerCommand);
    const callsAfterWake = powerStatusCalls();

    await jest.advanceTimersByTimeAsync(WAKE_BURST_WINDOW_MS);
    expect(powerStatusCalls()).toBe(callsAfterWake + burstAttempts);
    expect((await driver.getState(offDevice)).connection).toBe("disconnected");
    expect((await driver.getState(offDevice)).values.waking).toBe(false);

    await jest.advanceTimersByTimeAsync(1000);
    expect(powerStatusCalls()).toBe(callsAfterWake + burstAttempts);
    await jest.advanceTimersByTimeAsync(1500);
    expect(powerStatusCalls()).toBe(callsAfterWake + burstAttempts + 1);
  });

  test("disconnect() during the burst cancels it", async () => {
    await driver.executeCommand(offDevice, powerCommand);
    const callsAfterWake = powerStatusCalls();
    await jest.advanceTimersByTimeAsync(WAKE_BURST_INTERVAL_MS);
    await driver.disconnect(offDevice);
    const callsAtDisconnect = powerStatusCalls();
    expect(callsAtDisconnect).toBe(callsAfterWake + 1);

    await jest.advanceTimersByTimeAsync(WAKE_BURST_WINDOW_MS * 2);
    expect(powerStatusCalls()).toBe(callsAtDisconnect);
  });
});
