import { Device } from "../../core/types/Device";
import { fakeHa, haState, installFakeHaServer, latestFakeHaSocket } from "../../testUtils/fakeHaServer";
import { HOME_ASSISTANT_DRIVER_ID, HOME_ASSISTANT_POLL_INTERVAL_MS, HomeAssistantDriver } from "./HomeAssistantDriver";
import { resolveHaTarget } from "./haDeviceConfig";
import { resetHubForTests } from "./haInstanceHub";
import { registerHaInstance, resetHaInstancesForTests } from "./haInstanceRegistry";
import { HA_RECONNECT_BASE_DELAY_MS, HA_TOKEN_REJECTED_MESSAGE } from "./haSession";

jest.mock("../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));

const BASE = "http://ha.test:8123";
const TOKEN = "live-token-value";
const SETTLE_ROUNDS = 12;

let restReads: string[];

async function settle(): Promise<void> {
  for (let round = 0; round < SETTLE_ROUNDS; round++) await jest.advanceTimersByTimeAsync(0);
}

function installFetch(): void {
  restReads = [];
  global.fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    restReads.push(url);
    const entityId = decodeURIComponent(url.split("/api/states/")[1] ?? "");
    return { ok: true, status: 200, json: async () => haState(entityId, "off", { friendly_name: entityId }) } as Response;
  }) as unknown as typeof fetch;
}

function deviceFor(instanceId: string, entityId: string): Device {
  return { id: `dev-${entityId}`, name: entityId, category: "lighting", manufacturer: "Home Assistant", driverId: HOME_ASSISTANT_DRIVER_ID, capabilities: ["power"], config: { instanceId, entityId } };
}

beforeEach(() => {
  jest.useFakeTimers();
  installFakeHaServer(TOKEN);
  resetHaInstancesForTests();
  resetHubForTests();
  installFetch();
  fakeHa.states = [haState("light.a", "off"), haState("light.b", "off")];
});

afterEach(() => {
  resetHubForTests();
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function connectBoth(driver: HomeAssistantDriver, instanceId: string) {
  const a = deviceFor(instanceId, "light.a");
  const b = deviceFor(instanceId, "light.b");
  const seenA: unknown[] = [];
  const seenB: unknown[] = [];
  driver.subscribeToState(a, (_id, state) => seenA.push(state.values.power));
  driver.subscribeToState(b, (_id, state) => seenB.push(state.values.power));
  await Promise.all([driver.connect(a), driver.connect(b)]);
  await settle();
  return { a, b, seenA, seenB };
}

describe("HomeAssistantDriver over the shared WebSocket session", () => {
  test("devices on one instance share one socket and one subscription, and each gets only its own entity's changes", async () => {
    const instance = registerHaInstance(BASE, TOKEN);
    const { seenA, seenB } = await connectBoth(new HomeAssistantDriver(), instance.id);
    expect(fakeHa.sockets).toHaveLength(1);
    expect(fakeHa.requestLog.filter((type) => type === "subscribe_events")).toHaveLength(1);
    latestFakeHaSocket().pushStateChanged(haState("light.a", "on"), "light.a");
    expect(seenA[seenA.length - 1]).toBe("on");
    expect(seenB[seenB.length - 1]).toBe("off");
  });

  test("while the socket is live there are no per-device polling timers or REST reads", async () => {
    const instance = registerHaInstance(BASE, TOKEN);
    await connectBoth(new HomeAssistantDriver(), instance.id);
    const readsAfterConnect = restReads.length;
    await jest.advanceTimersByTimeAsync(HOME_ASSISTANT_POLL_INTERVAL_MS * 3);
    expect(restReads.length).toBe(readsAfterConnect);
  });

  test("falls back to 10 second REST polling while the socket is down and stops polling once it is live again", async () => {
    const instance = registerHaInstance(BASE, TOKEN);
    await connectBoth(new HomeAssistantDriver(), instance.id);
    const socket = latestFakeHaSocket();
    const readsWhileLive = restReads.length;
    (global as unknown as { WebSocket: unknown }).WebSocket = class { constructor() { throw new Error("no network"); } };
    socket.drop();
    await jest.advanceTimersByTimeAsync(HOME_ASSISTANT_POLL_INTERVAL_MS);
    expect(restReads.length).toBeGreaterThan(readsWhileLive);
    const readsWhileDown = restReads.length;
    installFakeHaServer(TOKEN);
    fakeHa.states = [haState("light.a", "on"), haState("light.b", "off")];
    await jest.advanceTimersByTimeAsync(HA_RECONNECT_BASE_DELAY_MS * 8);
    await settle();
    expect(fakeHa.sockets.length).toBeGreaterThan(0);
    const readsAtLive = restReads.length;
    await jest.advanceTimersByTimeAsync(HOME_ASSISTANT_POLL_INTERVAL_MS * 3);
    expect(restReads.length).toBe(readsAtLive);
    expect(readsAtLive).toBeGreaterThanOrEqual(readsWhileDown);
  });

  test("a resnapshot after reconnect updates devices whose state changed while the socket was down", async () => {
    const instance = registerHaInstance(BASE, TOKEN);
    const { seenA } = await connectBoth(new HomeAssistantDriver(), instance.id);
    fakeHa.states = [haState("light.a", "on"), haState("light.b", "off")];
    latestFakeHaSocket().drop();
    await jest.advanceTimersByTimeAsync(HA_RECONNECT_BASE_DELAY_MS);
    await settle();
    expect(seenA[seenA.length - 1]).toBe("on");
  });

  test("a rejected token stops retrying, stops polling and surfaces the token-rejected message", async () => {
    fakeHa.token = "a-different-token";
    const instance = registerHaInstance(BASE, TOKEN);
    const driver = new HomeAssistantDriver();
    const device = deviceFor(instance.id, "light.a");
    driver.subscribeToState(device, () => undefined);
    await driver.connect(device);
    await settle();
    const state = await driver.getState(device);
    expect(state.connection).toBe("disconnected");
    expect(state.values.authError).toBe(HA_TOKEN_REJECTED_MESSAGE);
    const reads = restReads.length;
    await jest.advanceTimersByTimeAsync(HOME_ASSISTANT_POLL_INTERVAL_MS * 5);
    expect(restReads.length).toBe(reads);
    expect(fakeHa.sockets).toHaveLength(1);
  });

  test("unsubscribing the last device closes the socket and leaves no timers", async () => {
    const instance = registerHaInstance(BASE, TOKEN);
    const driver = new HomeAssistantDriver();
    const device = deviceFor(instance.id, "light.a");
    const unsubscribe = driver.subscribeToState(device, () => undefined);
    await driver.connect(device);
    await settle();
    unsubscribe();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("browseMedia (ADR-HEARTH-182)", () => {
  function mediaDevice(instanceId: string): Device {
    return { id: "dev-media", name: "Speaker", category: "streaming", manufacturer: "Home Assistant", driverId: HOME_ASSISTANT_DRIVER_ID, capabilities: ["browseMedia", "playMedia"], config: { instanceId, entityId: "media_player.speaker" } };
  }

  test("browses over the device's already-open session, mapping the reply's own fields", async () => {
    const instance = registerHaInstance(BASE, TOKEN);
    const driver = new HomeAssistantDriver();
    const device = mediaDevice(instance.id);
    driver.subscribeToState(device, () => undefined);
    await driver.connect(device);
    await settle();
    fakeHa.registryReplies["media_player/browse_media"] = {
      title: "Speaker", media_content_id: "", media_content_type: "", can_play: false, can_expand: true,
      children: [{ title: "Jazz", media_content_id: "track-1", media_content_type: "music", can_play: true, can_expand: false }],
    };

    const promise = driver.browseMedia(device);
    await settle();
    const node = await promise;

    expect(node).toEqual({
      title: "Speaker", mediaContentId: "", mediaContentType: "", canPlay: false, canExpand: true,
      children: [{ title: "Jazz", mediaContentId: "track-1", mediaContentType: "music", canPlay: true, canExpand: false }],
    });
    expect(fakeHa.requestLog).toContain("media_player/browse_media");
  });

  test("a device with no session live yet gets a friendly error instead of hanging", async () => {
    const instance = registerHaInstance(BASE, TOKEN);
    const driver = new HomeAssistantDriver();
    await expect(driver.browseMedia(mediaDevice(instance.id))).rejects.toThrow(/not connected/);
  });
});

describe("resolveHaTarget", () => {
  test("accepts the old per-entity {baseUrl, token, entityId} shape by registering its instance", () => {
    const device: Device = { ...deviceFor("unused", "light.a"), config: { baseUrl: "ha.test", token: TOKEN, entityId: "light.a" } };
    const target = resolveHaTarget(device);
    expect(target.instance).toMatchObject({ baseUrl: BASE, token: TOKEN });
    expect(target.entityId).toBe("light.a");
  });

  test("an instanceId nobody knows, with no old-shape fallback, explains what to do", () => {
    expect(() => resolveHaTarget(deviceFor("ha-unknown", "light.a"))).toThrow(/sync from Home Assistant again/);
  });
});
