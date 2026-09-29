jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { loadDevices, removeDevice, saveDevice } from "./persistence";
import { Device } from "../core/types/Device";

const sonyDevice: Device = {
  id: "sony-1",
  name: "Living Room Sony",
  category: "tv",
  manufacturer: "Sony",
  driverId: "sony-bravia",
  capabilities: ["power"],
  config: { ipAddress: "192.168.1.50", psk: "super-secret-psk" },
};

describe("persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  test("saveDevice stores the psk in SecureStore, not in the AsyncStorage device list", async () => {
    await saveDevice(sonyDevice);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.device.sony-1.psk", "super-secret-psk");

    const [, storedJson] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    const stored = JSON.parse(storedJson);
    expect(stored).toHaveLength(1);
    expect(stored[0].config).toEqual({ ipAddress: "192.168.1.50" });
    expect(stored[0].config.psk).toBeUndefined();
  });

  // Security audit finding (2026-09-19, ADR-HEARTH-091): clientKey (LG) and token (Samsung) are
  // real pairing credentials that landed in plain AsyncStorage until now, the exact class of gap
  // ADR-HEARTH-008's own standing rule was supposed to prevent — same treatment as psk above.
  test("saveDevice stores LG's clientKey and Samsung's token in SecureStore too, not just psk", async () => {
    const lgDevice: Device = { ...sonyDevice, id: "lg-1", config: { ipAddress: "192.168.1.60", clientKey: "lg-secret-key" } };
    await saveDevice(lgDevice);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.device.lg-1.clientKey", "lg-secret-key");
    const [, lgStoredJson] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    expect(JSON.parse(lgStoredJson)[0].config.clientKey).toBeUndefined();

    jest.clearAllMocks();

    const samsungDevice: Device = { ...sonyDevice, id: "samsung-1", config: { ipAddress: "192.168.1.61", token: "samsung-secret-token" } };
    await saveDevice(samsungDevice);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.device.samsung-1.token", "samsung-secret-token");
    const [, samsungStoredJson] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    expect(JSON.parse(samsungStoredJson)[0].config.token).toBeUndefined();
  });

  // ADR-HEARTH-118 (2026-09-21): SwitchBotVacuumDriver's HMAC signing key, added to
  // SENSITIVE_CONFIG_KEYS proactively rather than after a fresh audit finds it missing.
  test("saveDevice stores SwitchBot's secret in SecureStore too", async () => {
    const vacuumDevice: Device = { ...sonyDevice, id: "vacuum-1", config: { token: "sb-token", secret: "sb-secret", deviceId: "sb-device-1" } };
    await saveDevice(vacuumDevice);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.device.vacuum-1.secret", "sb-secret");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.device.vacuum-1.token", "sb-token");
    const [, storedJson] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    expect(JSON.parse(storedJson)[0].config.secret).toBeUndefined();
    expect(JSON.parse(storedJson)[0].config.token).toBeUndefined();
    expect(JSON.parse(storedJson)[0].config.deviceId).toBe("sb-device-1"); // non-sensitive, stays inline
  });

  test("loadDevices rehydrates the psk from SecureStore back onto the device config", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify([{ ...sonyDevice, config: { ipAddress: "192.168.1.50" } }])
    );
    // Only psk applies to this device — clientKey/token must come back null, not leak across
    // fields just because SecureStore is asked about them too (loadDevices checks every key in
    // SENSITIVE_CONFIG_KEYS for every device, regardless of which one that device actually has).
    (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => Promise.resolve(key.endsWith(".psk") ? "super-secret-psk" : null));

    const devices = await loadDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0].config).toEqual({ ipAddress: "192.168.1.50", psk: "super-secret-psk" });
  });

  test("loadDevices returns an empty array when nothing is stored", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    await expect(loadDevices()).resolves.toEqual([]);
  });

  test("saveDevice replaces an existing entry for the same device id rather than duplicating it", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([{ ...sonyDevice, name: "Old Name", config: {} }]));

    await saveDevice({ ...sonyDevice, name: "New Name" });

    const [, storedJson] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    const stored = JSON.parse(storedJson);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("New Name");
  });

  test("sanitizes a device id containing characters SecureStore rejects (e.g. a MAC-address-derived id) rather than throwing (real-hardware finding, 2026-09-09)", async () => {
    const discoveredDevice: Device = { ...sonyDevice, id: "fcc-aa:bb:cc:dd:ee:ff" };
    await saveDevice(discoveredDevice);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("hearth.device.fcc-aa-bb-cc-dd-ee-ff.psk", "super-secret-psk");
  });

  test("loadDevices doesn't throw when a persisted device's id contains SecureStore-invalid characters", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify([{ ...sonyDevice, id: "fcc-aa:bb:cc:dd:ee:ff", config: { ipAddress: "192.168.1.50" } }])
    );
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await expect(loadDevices()).resolves.toHaveLength(1);
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith("hearth.device.fcc-aa-bb-cc-dd-ee-ff.psk");
  });

  test("removeDevice deletes both the list entry and the secure-store credential", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([{ ...sonyDevice, config: {} }]));

    await removeDevice("sony-1");

    const [, storedJson] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    expect(JSON.parse(storedJson)).toEqual([]);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("hearth.device.sony-1.psk");
  });

  // ADR-HEARTH-203: a real client log from this household showed SecureStore rejecting with
  // "KeyChainException: User interaction is not allowed" while the phone was locked/backgrounded.
  // Before this fix, one field failing here rejected the whole Promise.all in loadDevices(), which
  // App.tsx's own startup catch (see its comment there) turned into an EMPTY device list for the
  // whole session — every saved device lost, not just the one whose field hit the Keychain.
  describe("resilience to a SecureStore/Keychain failure (ADR-HEARTH-203)", () => {
    test("loadDevices still returns every device when one device's field throws (a locked-phone Keychain read)", async () => {
      const lgDevice: Device = { ...sonyDevice, id: "lg-1", config: { ipAddress: "192.168.1.60" } };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([{ ...sonyDevice, config: { ipAddress: "192.168.1.50" } }, lgDevice])
      );
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
        if (key === "hearth.device.sony-1.psk") {
          return Promise.reject(new Error("KeyChainException: User interaction is not allowed."));
        }
        return Promise.resolve(null);
      });

      const devices = await loadDevices();

      expect(devices).toHaveLength(2);
      expect(devices.find((d) => d.id === "sony-1")?.config?.psk).toBeUndefined(); // couldn't be read this time, but the device itself is not dropped
      expect(devices.find((d) => d.id === "lg-1")).toBeDefined();
    });

    test("loadDevices doesn't throw and still returns the device when every field on it throws", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([{ ...sonyDevice, config: { ipAddress: "192.168.1.50" } }]));
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error("KeyChainException: User interaction is not allowed."));

      await expect(loadDevices()).resolves.toEqual([{ ...sonyDevice, config: { ipAddress: "192.168.1.50" } }]);
    });

    test("removeDevice still removes the list entry when a SecureStore delete throws for one field", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([{ ...sonyDevice, config: {} }]));
      (SecureStore.deleteItemAsync as jest.Mock).mockImplementation((key: string) =>
        key.endsWith(".psk") ? Promise.reject(new Error("KeyChainException: User interaction is not allowed.")) : Promise.resolve()
      );

      await expect(removeDevice("sony-1")).resolves.toBeUndefined();

      const [, storedJson] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      expect(JSON.parse(storedJson)).toEqual([]);
    });
  });

  // ADR-HEARTH-203: confirms the save queue added with today's earlier merge (ADR-HEARTH-175)
  // actually serializes overlapping saves rather than dropping any of them — many devices "saved"
  // at once (e.g. a bulk import) must all end up in the final stored list.
  test("many overlapping saveDevice calls all land in the final list — none lost to a racing read-modify-write", async () => {
    let stored: string | null = null;
    (AsyncStorage.getItem as jest.Mock).mockImplementation(() => Promise.resolve(stored));
    (AsyncStorage.setItem as jest.Mock).mockImplementation((_key: string, value: string) => {
      stored = value;
      return Promise.resolve();
    });

    const devices: Device[] = Array.from({ length: 25 }, (_, i) => ({
      ...sonyDevice,
      id: `stress-${i}`,
      config: { ipAddress: `192.168.1.${i}` },
    }));

    await Promise.all(devices.map((device) => saveDevice(device)));

    const finalList = JSON.parse(stored!) as Device[];
    expect(finalList).toHaveLength(devices.length);
    const finalIds = new Set(finalList.map((d) => d.id));
    for (const device of devices) expect(finalIds.has(device.id)).toBe(true);
  });
});
