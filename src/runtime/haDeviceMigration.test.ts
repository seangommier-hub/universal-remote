import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Device } from "../core/types/Device";
import { HOME_ASSISTANT_DRIVER_ID } from "../drivers/homeAssistant/HomeAssistantDriver";
import { resolveHaTarget } from "../drivers/homeAssistant/haDeviceConfig";
import { findHaInstanceByUrl, resetHaInstancesForTests } from "../drivers/homeAssistant/haInstanceRegistry";
import { hydrateHaInstances } from "../drivers/homeAssistant/haInstanceStore";
import { migrateHaDevices } from "./haDeviceMigration";
import { loadDevices, saveDevice } from "./persistence";

const TOKEN = "legacy-secret-token";
const BASE = "http://ha.test:8123";

const disk = new Map<string, string>();
const secrets = new Map<string, string>();

function legacyDevice(entityId: string): Device {
  return { id: `homeassistant-${entityId.replace(".", "_")}-1`, name: entityId, category: "outlet", manufacturer: "Home Assistant", driverId: HOME_ASSISTANT_DRIVER_ID, capabilities: ["power"], config: { baseUrl: BASE, token: TOKEN, entityId } };
}

beforeEach(() => {
  disk.clear();
  secrets.clear();
  resetHaInstancesForTests();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => disk.get(key) ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => void disk.set(key, value));
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => secrets.get(key) ?? null);
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => void secrets.set(key, value));
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => void secrets.delete(key));
});

describe("migrateHaDevices", () => {
  test("moves each entity's token into one shared instance credential without losing it", async () => {
    const devices = [legacyDevice("switch.a"), legacyDevice("light.b")];
    for (const device of devices) await saveDevice(device);
    const migrated = await migrateHaDevices(await loadDevices());

    expect(migrated.map((d) => d.config)).toEqual([
      { instanceId: "ha-http-ha.test-8123", entityId: "switch.a" },
      { instanceId: "ha-http-ha.test-8123", entityId: "light.b" },
    ]);
    expect(findHaInstanceByUrl(BASE)?.token).toBe(TOKEN);
    expect([...secrets.values()].filter((value) => value === TOKEN)).toHaveLength(1);
    expect(disk.get("hearth.devices")).not.toContain(TOKEN);
  });

  test("after migration, a fresh launch loads devices without a token and the shared credential resolves them", async () => {
    await saveDevice(legacyDevice("switch.a"));
    await migrateHaDevices(await loadDevices());
    resetHaInstancesForTests();
    await hydrateHaInstances();
    const [device] = await loadDevices();
    expect(device.config).toEqual({ instanceId: "ha-http-ha.test-8123", entityId: "switch.a" });
    expect(resolveHaTarget(device).instance.token).toBe(TOKEN);
  });

  test("running it again changes nothing", async () => {
    await saveDevice(legacyDevice("switch.a"));
    const once = await migrateHaDevices(await loadDevices());
    const twice = await migrateHaDevices(once);
    expect(twice).toEqual(once);
  });

  test("an interrupted run (instance saved, old token still present) finishes on the next launch", async () => {
    await saveDevice(legacyDevice("switch.a"));
    const [legacy] = await loadDevices();
    await migrateHaDevices([legacy]);
    secrets.set("hearth.device.homeassistant-switch_a-1.token", TOKEN);
    const [reloaded] = await loadDevices();
    expect(reloaded.config?.token).toBe(TOKEN);
    const [finished] = await migrateHaDevices([reloaded]);
    expect(finished.config).toEqual({ instanceId: "ha-http-ha.test-8123", entityId: "switch.a" });
    expect(secrets.has("hearth.device.homeassistant-switch_a-1.token")).toBe(false);
  });

  test("a failure while saving the shared credential leaves the device on the old shape, which still resolves", async () => {
    await saveDevice(legacyDevice("switch.a"));
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      if (key.startsWith("hearth.ha.instance")) throw new Error("keychain locked");
    });
    const [result] = await migrateHaDevices(await loadDevices());
    expect(result.config).toMatchObject({ baseUrl: BASE, token: TOKEN, entityId: "switch.a" });
    expect(resolveHaTarget(result).instance.token).toBe(TOKEN);
  });

  test("other brands' devices are left alone", async () => {
    const other: Device = { ...legacyDevice("switch.a"), id: "roku-1", driverId: "roku-ecp", config: { ipAddress: "1.2.3.4", token: "keep" } };
    expect(await migrateHaDevices([other])).toEqual([other]);
  });
});
