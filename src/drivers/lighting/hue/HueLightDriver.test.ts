import { HueLightDriver, HUE_LIGHT_DRIVER_ID } from "./HueLightDriver";
import { Device } from "../../../core/types/Device";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function lightStateResponse(on: boolean, bri = 254, hue = 0, sat = 0, name = "Lamp") {
  return jsonResponse({ state: { on, bri, hue, sat, reachable: true }, name });
}

const device: Device = {
  id: "hue-1",
  name: "Living Room Lamp",
  category: "lighting",
  manufacturer: "Philips",
  driverId: HUE_LIGHT_DRIVER_ID,
  capabilities: [],
  config: { bridgeIpAddress: "192.168.1.50", username: "abc123", lightId: "1" },
};

describe("HueLightDriver", () => {
  let driver: HueLightDriver;

  beforeEach(() => {
    driver = new HueLightDriver();
    global.fetch = jest.fn();
  });

  test("declares power, setBrightness, and setColor — no TV-shaped capabilities", () => {
    const caps = driver.getCapabilities();
    expect(caps).toEqual(["power", "setBrightness", "setColor"]);
  });

  test("connect() reads real light state and normalizes it into DeviceState", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(lightStateResponse(true, 254, 0, 0));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("connected");
    expect(state.values.power).toBe("on");
    expect(state.values.brightness).toBe(100);
    expect(state.values.name).toBe("Lamp");
  });

  test("connect() marks the device disconnected if the bridge reports the light unreachable", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ state: { on: false, bri: 1, reachable: false }, name: "Lamp" }));

    await driver.connect(device);
    const state = await driver.getState(device);

    expect(state.connection).toBe("disconnected");
  });

  test("connect() marks the device disconnected and rethrows on a network failure", async () => {
    // requestWithRelayFallback swallows the raw fetch rejection and retries via Family Command
    // Center; with none configured in this test environment, that's the error that propagates.
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network unreachable"));

    await expect(driver.connect(device)).rejects.toThrow(/Could not reach/);
    const state = await driver.getState(device);
    expect(state.connection).toBe("disconnected");
  });

  test("power toggles off when currently on, sending only {on: false}", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(lightStateResponse(true));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([{ success: {} }]));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    const call = (global.fetch as jest.Mock).mock.calls[1];
    expect(call[0]).toBe("http://192.168.1.50:80/api/abc123/lights/1/state");
    expect(JSON.parse(call[1].body)).toEqual({ on: false });
    expect(result.state?.power).toBe("off");
  });

  test("power toggles on when currently off", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(lightStateResponse(false));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([{ success: {} }]));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "power" });

    expect(result.state?.power).toBe("on");
  });

  test("setBrightness sends the normalized percentage and updates state", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(lightStateResponse(true));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([{ success: {} }]));
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "setBrightness", args: { brightness: 75 } });

    const call = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(call[1].body)).toEqual({ bri: 191 }); // round(1 + 0.75 * 253)
    expect(result.state?.brightness).toBe(75);
  });

  test("setBrightness without a numeric arg throws without any network call", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(lightStateResponse(true));
    await driver.connect(device);

    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setBrightness" })).rejects.toThrow(/numeric 'brightness'/);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  test("setColor sends both hue and saturation and updates state", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(lightStateResponse(true));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([{ success: {} }]));
    const result = await driver.executeCommand(device, {
      deviceId: device.id,
      capability: "setColor",
      args: { hue: 240, saturation: 80 },
    });

    const call = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(call[1].body)).toEqual({ hue: 43690, sat: 203 });
    expect(result.state?.hue).toBe(240);
    expect(result.state?.saturation).toBe(80);
  });

  test("setColor with a missing arg throws without any network call", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(lightStateResponse(true));
    await driver.connect(device);

    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
    await expect(
      driver.executeCommand(device, { deviceId: device.id, capability: "setColor", args: { hue: 240 } })
    ).rejects.toThrow(/'hue'.*'saturation'/);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  test("a failed command marks the device disconnected", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(lightStateResponse(true));
    await driver.connect(device);

    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network unreachable"));
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "power" })).rejects.toThrow(/Could not reach/);

    const state = await driver.getState(device);
    expect(state.connection).toBe("disconnected");
  });

  test("executeCommand throws without config when the light hasn't been paired", async () => {
    const unpaired: Device = { ...device, config: undefined };
    await expect(driver.executeCommand(unpaired, { deviceId: unpaired.id, capability: "power" })).rejects.toThrow(/pair it first/);
  });
});
