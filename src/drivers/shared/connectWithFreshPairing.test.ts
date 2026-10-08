import { Device } from "../../core/types/Device";
import { connectWithFreshPairing } from "./connectWithFreshPairing";

function deviceWith(config: Record<string, unknown> | undefined): Device {
  return { id: "tv-1", name: "TV", category: "tv", manufacturer: "LG", driverId: "x", capabilities: [], config };
}

describe("connectWithFreshPairing", () => {
  test("connects with the saved credential removed and keeps every other config field", async () => {
    const device = deviceWith({ ipAddress: "192.168.1.70", clientKey: "old", hwaddr: "AA" });
    let configDuringConnect: Record<string, unknown> | undefined;

    await connectWithFreshPairing(device, "clientKey", async () => {
      configDuringConnect = { ...device.config };
      device.config!.clientKey = "new";
    });

    expect(configDuringConnect).toEqual({ ipAddress: "192.168.1.70", hwaddr: "AA" });
    expect(device.config).toEqual({ ipAddress: "192.168.1.70", clientKey: "new", hwaddr: "AA" });
  });

  test("a failed attempt puts the old credential back and rethrows the failure", async () => {
    const device = deviceWith({ ipAddress: "192.168.1.70", clientKey: "old" });

    await expect(
      connectWithFreshPairing(device, "clientKey", async () => {
        throw new Error("Timed out waiting for pairing approval");
      })
    ).rejects.toThrow("Timed out waiting for pairing approval");

    expect(device.config).toEqual({ ipAddress: "192.168.1.70", clientKey: "old" });
  });

  test("a failure never overwrites a newer credential that was stored in the meantime", async () => {
    const device = deviceWith({ clientKey: "old" });

    await expect(
      connectWithFreshPairing(device, "clientKey", async () => {
        device.config!.clientKey = "newer";
        throw new Error("late failure");
      })
    ).rejects.toThrow("late failure");

    expect(device.config!.clientKey).toBe("newer");
  });

  test("a device that never had a credential ends without one after a failure", async () => {
    const device = deviceWith({ ipAddress: "192.168.1.70" });

    await expect(connectWithFreshPairing(device, "clientKey", async () => Promise.reject(new Error("no")))).rejects.toThrow("no");

    expect(device.config).toEqual({ ipAddress: "192.168.1.70" });
  });

  test("a cancelled attempt followed straight away by a second one still restores the true original when both fail", async () => {
    const device = deviceWith({ clientKey: "old" });
    let failFirst: (error: Error) => void = () => undefined;
    const first = connectWithFreshPairing(device, "clientKey", () => new Promise<void>((_, reject) => (failFirst = reject)));
    const second = connectWithFreshPairing(device, "clientKey", () => Promise.reject(new Error("second failed")));

    await expect(second).rejects.toThrow("second failed");
    expect(device.config!.clientKey).toBe("old");
    failFirst(new Error("first failed"));
    await expect(first).rejects.toThrow("first failed");
    expect(device.config!.clientKey).toBe("old");
  });

  test("a device with no config at all is refused clearly", async () => {
    await expect(connectWithFreshPairing(deviceWith(undefined), "clientKey", async () => undefined)).rejects.toThrow(/no saved connection details/);
  });
});
