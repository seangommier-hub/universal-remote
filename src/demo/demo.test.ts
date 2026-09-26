import { isDemoMode, demoScreenParam } from "./demoMode";
import { demoActivities, demoDevices, DEMO_DEVICE_SCRIPTS } from "./demoHousehold";
import { demoDiscoverAllBody } from "./demoDiscoverPayload";
import { DISCOVER_ALL_PATH, parseNetworkDevice } from "../discovery/discoverAll";
import { createDemoDriver } from "./demoDriver";
import { demoFetch, DEMO_FCC_BASE_URL } from "./demoFetch";
import { resolveDemoScreen } from "./demoScreenRoute";
import { DeviceDriver } from "../core/drivers/DeviceDriver";
import * as secureStore from "../web/secureStore";
import asyncStorage from "../web/asyncStorage";

describe("demo mode guard", () => {
  const original = process.env.EXPO_PUBLIC_DEMO;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_DEMO;
    else process.env.EXPO_PUBLIC_DEMO = original;
  });

  it("test_demo_mode_is_off_by_default", () => {
    delete process.env.EXPO_PUBLIC_DEMO;
    expect(isDemoMode()).toBe(false);
    expect(demoScreenParam()).toBeNull();
  });

  it("test_demo_mode_needs_the_exact_env_value", () => {
    process.env.EXPO_PUBLIC_DEMO = "true";
    expect(isDemoMode()).toBe(false);
    process.env.EXPO_PUBLIC_DEMO = "1";
    expect(isDemoMode()).toBe(true);
  });
});

describe("demo fixtures", () => {
  it("test_household_has_six_valid_devices_and_is_deterministic", () => {
    const devices = demoDevices();
    expect(devices).toHaveLength(6);
    expect(new Set(devices.map((d) => d.id)).size).toBe(6);
    devices.forEach((d) => expect(DEMO_DEVICE_SCRIPTS[d.id]).toBeDefined());
    expect(demoDevices()).toEqual(devices);
    expect(demoActivities()).toEqual(demoActivities());
    expect(demoActivities().length).toBeGreaterThanOrEqual(3);
  });

  it("test_discover_payload_parses_with_six_recognized_and_twenty_one_others", () => {
    const parsed = demoDiscoverAllBody().devices.map(parseNetworkDevice);
    expect(parsed.every((d) => d !== null)).toBe(true);
    const recognized = parsed.filter((d) => d?.brand);
    expect(recognized).toHaveLength(6);
    expect(parsed.length - recognized.length).toBeGreaterThanOrEqual(20);
    expect(new Set(parsed.map((d) => d?.ip)).size).toBe(parsed.length);
  });

  it("test_demo_fetch_serves_fixture_and_blocks_real_hosts", async () => {
    const ok = await demoFetch(`${DEMO_FCC_BASE_URL}${DISCOVER_ALL_PATH}`);
    expect(((await ok.json()) as { devices: unknown[] }).devices.length).toBeGreaterThan(20);
    expect((await demoFetch(`${DEMO_FCC_BASE_URL}/api/other`)).status).toBe(404);
    await expect(demoFetch("https://example.com/")).rejects.toThrow("network access is disabled");
  });
});

describe("demo driver", () => {
  const real = { id: "x", displayName: "X", getCapabilities: () => ["power"] } as unknown as DeviceDriver;

  it("test_reachable_device_connects_with_scripted_state_and_powers_off", async () => {
    const [lg] = demoDevices();
    const driver = createDemoDriver(real);
    await driver.connect(lg);
    expect((await driver.getState(lg)).values.power).toBe("on");
    await driver.executeCommand(lg, { deviceId: lg.id, capability: "powerOff" });
    expect((await driver.getState(lg)).values.power).toBe("off");
  });

  it("test_unreachable_device_reports_disconnected_and_throws", async () => {
    const roku = demoDevices()[2];
    const driver = createDemoDriver(real);
    await expect(driver.connect(roku)).rejects.toThrow("offline");
    expect((await driver.getState(roku)).connection).toBe("disconnected");
  });
});

describe("demo screen route", () => {
  const devices = demoDevices();
  it("test_route_resolves_known_screens_and_rejects_unknown", () => {
    expect(resolveDemoScreen("remote:lg", devices)).toMatchObject({ name: "remote" });
    expect(resolveDemoScreen("discover", devices)).toEqual({ name: "discover" });
    expect(resolveDemoScreen("add:roku", devices)).toEqual({ name: "add", brand: "roku" });
    expect(resolveDemoScreen("remote:nope", devices)).toBeNull();
    expect(resolveDemoScreen("bogus", devices)).toBeNull();
    expect(resolveDemoScreen(null, devices)).toBeNull();
  });
});

describe("web shims", () => {
  it("test_secure_store_shim_round_trips_and_deletes", async () => {
    await secureStore.setItemAsync("k", "v");
    expect(await secureStore.getItemAsync("k")).toBe("v");
    await secureStore.deleteItemAsync("k");
    expect(await secureStore.getItemAsync("k")).toBeNull();
  });

  it("test_async_storage_shim_round_trips", async () => {
    await asyncStorage.setItem("a", "1");
    expect(await asyncStorage.getItem("a")).toBe("1");
    await asyncStorage.removeItem("a");
    expect(await asyncStorage.getItem("a")).toBeNull();
  });
});
