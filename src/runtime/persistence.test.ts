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

  test("loadDevices rehydrates the psk from SecureStore back onto the device config", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify([{ ...sonyDevice, config: { ipAddress: "192.168.1.50" } }])
    );
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("super-secret-psk");

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
});
