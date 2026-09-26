import { DeviceDriver } from "../core/drivers/DeviceDriver";
import { Device } from "../core/types/Device";
import { AddFlowDependencies, AddFlowFailedError, AddFlowNeedsFccError, connectBrandDevice, connectBrandDeviceOrThrow, describeAddFailure, missingFields } from "./addDeviceFlow";
import { getBrand } from "./brandRegistry";

function fakeDriver(connect: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  const disconnect = jest.fn().mockResolvedValue(undefined);
  const driver = { id: "d", displayName: "d", getCapabilities: () => ["power"], connect, disconnect } as unknown as DeviceDriver;
  return { driver, connect, disconnect };
}

function makeDeps(driver: DeviceDriver | undefined, overrides: Partial<AddFlowDependencies> = {}): AddFlowDependencies {
  return { driverRegistry: { get: () => driver }, readReportedName: () => undefined, hasFccConfig: async () => true, ...overrides };
}

const TARGET = { id: "fcc-aa", ipAddress: "192.168.1.50", hwaddr: "aa:bb" };

describe("connectBrandDevice", () => {
  test("connects an ip-only brand with defaults and returns the device", async () => {
    const { driver, connect } = fakeDriver();
    const outcome = await connectBrandDevice(makeDeps(driver), getBrand("roku"), TARGET);
    expect(outcome.kind).toBe("added");
    if (outcome.kind !== "added") return;
    expect(outcome.device).toMatchObject({ id: "fcc-aa", name: "Roku", driverId: getBrand("roku").driverId, category: "streaming", config: { ipAddress: "192.168.1.50", hwaddr: "aa:bb" } });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  test("prefers the device's own reported name over the default", async () => {
    const { driver } = fakeDriver();
    const outcome = await connectBrandDevice(makeDeps(driver, { readReportedName: () => "  Living Room  " }), getBrand("roku"), TARGET);
    expect(outcome.kind === "added" && outcome.device.name).toBe("Living Room");
  });

  test("failure disconnects to cancel the driver's reconnect loop and returns friendly text", async () => {
    const { driver, disconnect } = fakeDriver(jest.fn().mockRejectedValue(new Error("Network request failed")));
    const outcome = await connectBrandDevice(makeDeps(driver), getBrand("roku"), TARGET);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") return;
    expect(outcome.message).toContain("Couldn't reach the Roku at 192.168.1.50");
    expect(outcome.diagnosis?.kind).toBe("lan-blocked");
  });

  test("a non-network failure keeps the driver text but adds context and the brand hint", async () => {
    const { driver } = fakeDriver(jest.fn().mockRejectedValue(new Error("Forbidden")));
    const outcome = await connectBrandDevice(makeDeps(driver), getBrand("samsung"), TARGET);
    expect(outcome).toMatchObject({ kind: "failed", diagnosis: null });
    expect(outcome.kind === "failed" && outcome.message).toMatch(/Couldn't add the Samsung TV: Forbidden \(Accept the Allow prompt/);
  });

  test("a missing driver is a plain failure, not a crash", async () => {
    const outcome = await connectBrandDevice(makeDeps(undefined), getBrand("roku"), TARGET);
    expect(outcome).toMatchObject({ kind: "failed" });
  });

  test("a brand that needs Family Command Center stops before connecting when none is saved", async () => {
    const { driver, connect } = fakeDriver();
    const outcome = await connectBrandDevice(makeDeps(driver, { hasFccConfig: async () => false }), getBrand("lg"), TARGET);
    expect(outcome).toEqual({ kind: "needs-fcc" });
    expect(connect).not.toHaveBeenCalled();
  });

  test("multi-step brands are routed to their own screen without connecting", async () => {
    const { driver, connect } = fakeDriver();
    expect(await connectBrandDevice(makeDeps(driver), getBrand("hue"), TARGET)).toEqual({ kind: "custom-screen" });
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("Sony inline PSK step", () => {
  test("a discovered Sony asks for the PSK instead of failing, and never touches the driver", async () => {
    const { driver, connect } = fakeDriver();
    const outcome = await connectBrandDevice(makeDeps(driver), getBrand("sony"), TARGET);
    expect(connect).not.toHaveBeenCalled();
    expect(outcome.kind).toBe("needs-fields");
    if (outcome.kind !== "needs-fields") return;
    expect(outcome.fields.map((f) => f.key)).toEqual(["psk"]);
    expect(outcome.fields[0].help).toMatch(/Settings → Network & Internet → Home Network → IP Control/);
  });

  test("a blank PSK is still missing", () => {
    expect(missingFields(getBrand("sony"), { psk: "   " })).toHaveLength(1);
  });

  test("with the PSK entered it connects with psk in the saved config", async () => {
    const { driver, connect } = fakeDriver();
    const outcome = await connectBrandDevice(makeDeps(driver), getBrand("sony"), { ...TARGET, fieldValues: { psk: " 0000 " } });
    expect(outcome.kind).toBe("added");
    const connected = connect.mock.calls[0][0] as Device;
    expect(connected.config).toMatchObject({ ipAddress: "192.168.1.50", psk: "0000" });
  });

  test("Xbox asks for its Live ID the same way", async () => {
    const outcome = await connectBrandDevice(makeDeps(fakeDriver().driver), getBrand("xbox"), TARGET);
    expect(outcome.kind === "needs-fields" && outcome.fields[0].key).toBe("liveId");
  });
});

describe("describeAddFailure", () => {
  test("a rejected token points at settings rather than the device", () => {
    const { message } = describeAddFailure(new Error("Family Command Center rejected the saved token."), getBrand("lg"), "1.2.3.4");
    expect(message).toMatch(/token/i);
  });
});

describe("plain-language pairing failures (ADR-HEARTH-155)", () => {
  test("a Samsung denial names the Device Manager path", () => {
    const { message } = describeAddFailure(new Error("Pairing was denied on the TV"), getBrand("samsung"), "1.2.3.4");
    expect(message).toContain("Access Notification");
  });

  test("a Roku 403 names the Permissive setting", () => {
    const { message } = describeAddFailure(new Error("Roku at 1.2.3.4 returned HTTP 403 for device-info"), getBrand("roku"), "1.2.3.4");
    expect(message).toContain("Permissive");
  });
});

describe("connectBrandDeviceOrThrow", () => {
  test("resolves to the device on success", async () => {
    const { driver } = fakeDriver();
    const device = await connectBrandDeviceOrThrow(makeDeps(driver), getBrand("roku"), TARGET);
    expect(device.id).toBe("fcc-aa");
  });

  test("throws AddFlowFailedError carrying the friendly message", async () => {
    const { driver } = fakeDriver(jest.fn().mockRejectedValue(new Error("Network request failed")));
    await expect(connectBrandDeviceOrThrow(makeDeps(driver), getBrand("roku"), TARGET)).rejects.toBeInstanceOf(AddFlowFailedError);
  });

  test("throws AddFlowNeedsFccError when Family Command Center is missing", async () => {
    const { driver } = fakeDriver();
    await expect(connectBrandDeviceOrThrow(makeDeps(driver, { hasFccConfig: async () => false }), getBrand("lg"), TARGET)).rejects.toBeInstanceOf(AddFlowNeedsFccError);
  });
});

describe("broadlink", () => {
  test("starts with no capabilities until buttons are taught", async () => {
    const { driver } = fakeDriver();
    const outcome = await connectBrandDevice(makeDeps(driver), getBrand("broadlink"), TARGET);
    expect(outcome.kind === "added" && outcome.device.capabilities).toEqual([]);
  });
});
