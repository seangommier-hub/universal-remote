import { DeviceDriver } from "../core/drivers/DeviceDriver";
import { AndroidTvClient } from "../drivers/tv/androidtv/AndroidTvClient";
import { confirmAndroidTvPairing, normalizePairingCode } from "./androidTvPairing";

describe("normalizePairingCode", () => {
  test.each([
    ["a1b2c3", "A1B2C3"],
    ["  0F9E8d ", "0F9E8D"],
  ])("accepts %s as %s", (input, expected) => {
    expect(normalizePairingCode(input)).toBe(expected);
  });

  test.each(["", "12345", "1234567", "12345G", "12 345", "-12345"])("rejects %p", (input) => {
    expect(normalizePairingCode(input)).toBeNull();
  });
});

describe("confirmAndroidTvPairing", () => {
  const start = { sessionId: "s1", name: "Shield", mac: "AA-BB-CC-DD-EE-FF" };

  function fakeDriver() {
    return { getCapabilities: () => ["power"], connect: jest.fn().mockResolvedValue(undefined) } as unknown as DeviceDriver & { connect: jest.Mock };
  }

  function fakeClient(finish: jest.Mock) {
    return { finishPairing: finish } as unknown as AndroidTvClient;
  }

  test("submits the code, saves the TV's lower-case colon MAC and connects the new device", async () => {
    const driver = fakeDriver();
    const finish = jest.fn().mockResolvedValue({ name: "Living Room Shield", mac: "AA-BB-CC-DD-EE-FF" });

    const device = await confirmAndroidTvPairing({ client: fakeClient(finish), driver, start, code: "A1B2C3", ipAddress: "192.168.1.91", name: "" });

    expect(finish).toHaveBeenCalledWith("s1", "A1B2C3");
    expect(device).toMatchObject({ name: "Living Room Shield", category: "streaming", manufacturer: "Google", config: { ipAddress: "192.168.1.91", hwaddr: "aa:bb:cc:dd:ee:ff" } });
    expect(driver.connect).toHaveBeenCalledWith(device);
  });

  test("prefers the name the person typed and omits hwaddr when the TV reported no MAC", async () => {
    const driver = fakeDriver();
    const finish = jest.fn().mockResolvedValue({ name: "", mac: "" });

    const device = await confirmAndroidTvPairing({ client: fakeClient(finish), driver, start: { ...start, mac: "" }, code: "A1B2C3", ipAddress: "192.168.1.91", name: " Den TV " });

    expect(device.name).toBe("Den TV");
    expect(device.config).toEqual({ ipAddress: "192.168.1.91" });
  });

  test("does not connect when the code is refused", async () => {
    const driver = fakeDriver();
    const finish = jest.fn().mockRejectedValue(new Error("bad code"));

    await expect(confirmAndroidTvPairing({ client: fakeClient(finish), driver, start, code: "000000", ipAddress: "192.168.1.91", name: "" })).rejects.toThrow("bad code");
    expect(driver.connect).not.toHaveBeenCalled();
  });
});
