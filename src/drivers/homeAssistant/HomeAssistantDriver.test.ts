import { Device } from "../../core/types/Device";
import { logger } from "../../core/logging/logger";
import { HomeAssistantApiError, HomeAssistantClient, normalizeHomeAssistantUrl } from "./HomeAssistantClient";
import { HOME_ASSISTANT_DRIVER_ID, HOME_ASSISTANT_POLL_INTERVAL_MS, HomeAssistantDriver } from "./HomeAssistantDriver";

const TOKEN = "super-secret-token-value";
const BASE = "http://ha.test:8123";

interface Call {
  url: string;
  method: string;
  auth: string;
  body: string;
}

let calls: Call[];
let entityState: { state: string; attributes: Record<string, unknown> };
let failWith: "none" | "refuse" | number;

function installFetch(): void {
  calls = [];
  failWith = "none";
  entityState = { state: "off", attributes: { friendly_name: "Lamp" } };
  global.fetch = jest.fn(async (input: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(input), method: init?.method ?? "GET", auth: headers.Authorization ?? "", body: String(init?.body ?? "") });
    if (failWith === "refuse") throw new TypeError("Network request failed");
    if (typeof failWith === "number") return { ok: false, status: failWith, json: async () => ({}) } as Response;
    const isState = String(input).includes("/api/states/");
    return { ok: true, status: 200, json: async () => (isState ? { entity_id: "light.lamp", ...entityState } : []) } as Response;
  }) as unknown as typeof fetch;
}

function makeDevice(): Device {
  return {
    id: "ha-1", name: "Lamp", category: "lighting", manufacturer: "Home Assistant", driverId: HOME_ASSISTANT_DRIVER_ID, capabilities: ["power", "setBrightness"],
    config: { baseUrl: BASE, token: TOKEN, entityId: "light.lamp" },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  installFetch();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("normalizeHomeAssistantUrl", () => {
  test.each([
    ["homeassistant.local", "http://homeassistant.local:8123"],
    ["homeassistant.local:8123/", "http://homeassistant.local:8123"],
    ["192.168.1.5:9000", "http://192.168.1.5:9000"],
    ["https://ha.example.com/", "https://ha.example.com"],
    ["http://ha.local:8123/api", "http://ha.local:8123"],
  ])("%s becomes %s", (typed, expected) => {
    expect(normalizeHomeAssistantUrl(typed)).toBe(expected);
  });
});

describe("HomeAssistantClient", () => {
  test("sends the token only as a bearer header, never in the URL", async () => {
    await new HomeAssistantClient({ baseUrl: BASE, token: TOKEN }).getStates();
    expect(calls[0].url).toBe(`${BASE}/api/states`);
    expect(calls[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].url).not.toContain(TOKEN);
  });

  test("a 401 becomes a plain-language token error", async () => {
    failWith = 401;
    await expect(new HomeAssistantClient({ baseUrl: BASE, token: TOKEN }).getStates()).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/access token/) });
    await expect(new HomeAssistantClient({ baseUrl: BASE, token: TOKEN }).getStates()).rejects.toBeInstanceOf(HomeAssistantApiError);
  });
});

describe("HomeAssistantDriver", () => {
  test("connect reads the entity and reports its state", async () => {
    const driver = new HomeAssistantDriver();
    entityState = { state: "on", attributes: { friendly_name: "Lamp", brightness: 128 } };
    await driver.connect(makeDevice());
    const state = await driver.getState(makeDevice());
    expect(state.connection).toBe("connected");
    expect(state.values).toMatchObject({ power: "on", brightness: 50 });
    expect(calls[0].url).toBe(`${BASE}/api/states/light.lamp`);
  });

  test("a command POSTs the matching service and then re-reads the entity", async () => {
    const driver = new HomeAssistantDriver();
    const device = makeDevice();
    await driver.connect(device);
    entityState = { state: "on", attributes: { friendly_name: "Lamp", brightness: 255 } };
    const result = await driver.executeCommand(device, { deviceId: device.id, capability: "setBrightness", args: { brightness: 100 } });
    const post = calls.find((call) => call.method === "POST")!;
    expect(post.url).toBe(`${BASE}/api/services/light/turn_on`);
    expect(JSON.parse(post.body)).toEqual({ entity_id: "light.lamp", brightness_pct: 100 });
    expect(result.state).toMatchObject({ power: "on", brightness: 100 });
  });

  test("a bad argument throws without marking the device disconnected", async () => {
    const driver = new HomeAssistantDriver();
    const device = makeDevice();
    await driver.connect(device);
    await expect(driver.executeCommand(device, { deviceId: device.id, capability: "setBrightness" })).rejects.toThrow(/brightness/);
    expect((await driver.getState(device)).connection).toBe("connected");
  });

  test("polls about every 10 seconds while subscribed, and stops when unsubscribed", async () => {
    const driver = new HomeAssistantDriver();
    const device = makeDevice();
    const seen: unknown[] = [];
    const unsubscribe = driver.subscribeToState(device, (_id, state) => seen.push(state.values.power));
    await driver.connect(device);
    const afterConnect = calls.length;
    entityState = { state: "on", attributes: {} };
    await jest.advanceTimersByTimeAsync(HOME_ASSISTANT_POLL_INTERVAL_MS);
    expect(calls.length).toBe(afterConnect + 1);
    expect(seen[seen.length - 1]).toBe("on");
    unsubscribe();
    await jest.advanceTimersByTimeAsync(HOME_ASSISTANT_POLL_INTERVAL_MS * 3);
    expect(calls.length).toBe(afterConnect + 1);
  });

  test("makes no requests while nothing is subscribed", async () => {
    const driver = new HomeAssistantDriver();
    await driver.connect(makeDevice());
    const afterConnect = calls.length;
    await jest.advanceTimersByTimeAsync(HOME_ASSISTANT_POLL_INTERVAL_MS * 5);
    expect(calls.length).toBe(afterConnect);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a failed poll marks the device disconnected and reconnects with backoff once HA returns", async () => {
    const driver = new HomeAssistantDriver();
    const device = makeDevice();
    driver.subscribeToState(device, () => undefined);
    await driver.connect(device);
    failWith = "refuse";
    await jest.advanceTimersByTimeAsync(HOME_ASSISTANT_POLL_INTERVAL_MS);
    expect((await driver.getState(device)).connection).toBe("disconnected");
    failWith = "none";
    await jest.advanceTimersByTimeAsync(60_000);
    expect((await driver.getState(device)).connection).toBe("connected");
  });

  test("the token never appears in any log line", async () => {
    const logged: string[] = [];
    for (const level of ["debug", "info", "warn", "error"] as const) jest.spyOn(logger, level).mockImplementation((_scope: string, message: string, meta?: Record<string, unknown>) => void logged.push(`${message}${JSON.stringify(meta ?? {})}`));
    const driver = new HomeAssistantDriver();
    failWith = 401;
    await expect(driver.connect(makeDevice())).rejects.toBeInstanceOf(HomeAssistantApiError);
    await jest.advanceTimersByTimeAsync(10_000);
    driver.disconnect(makeDevice());
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join("\n")).not.toContain(TOKEN);
  });
});
