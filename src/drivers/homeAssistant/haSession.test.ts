import { logger } from "../../core/logging/logger";
import { fakeHa, haState, installFakeHaServer, latestFakeHaSocket } from "../../testUtils/fakeHaServer";
import { MockWebSocket } from "../../testUtils/mockWebSocket";
import { HA_PING_INTERVAL_MS, HA_PONG_TIMEOUT_MS, HA_RECONNECT_BASE_DELAY_MS, HaSession } from "./haSession";
import { webSocketUrlFor } from "./haSocket";

jest.mock("../shared/backoffJitter", () => ({ withBackoffJitter: (delayMs: number) => delayMs }));

const BASE = "http://ha.test:8123";
const TOKEN = "session-token-value";

function newSession(token = TOKEN): HaSession {
  return new HaSession({ baseUrl: BASE, token });
}

const SETTLE_ROUNDS = 12;

/** Lets the fake server's chain of microtask replies (auth, subscribe, snapshot) run to completion. */
async function settle(): Promise<void> {
  for (let round = 0; round < SETTLE_ROUNDS; round++) await jest.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  jest.useFakeTimers();
  installFakeHaServer(TOKEN);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("webSocketUrlFor", () => {
  test.each([
    ["http://ha.test:8123", "ws://ha.test:8123/api/websocket"],
    ["https://ha.example.com", "wss://ha.example.com/api/websocket"],
  ])("%s -> %s", (base, expected) => expect(webSocketUrlFor(base)).toBe(expected));
});

describe("HaSession authentication", () => {
  test("answers auth_required with the token, subscribes to state_changed, takes a snapshot, then goes live", async () => {
    fakeHa.states = [haState("light.lamp", "on")];
    const session = newSession();
    session.start();
    await settle();
    const ws = latestFakeHaSocket();
    expect(ws.url).toBe("ws://ha.test:8123/api/websocket");
    expect(JSON.parse(ws.sentMessages[0])).toEqual({ type: "auth", access_token: TOKEN });
    expect(fakeHa.requestLog).toEqual(["subscribe_events", "get_states"]);
    expect(JSON.parse(ws.sentMessages[1])).toMatchObject({ type: "subscribe_events", event_type: "state_changed" });
    expect(session.getStatus()).toBe("live");
    expect(session.entity("light.lamp")?.state).toBe("on");
  });

  test("auth_invalid stops retrying and reports auth-failed", async () => {
    const session = newSession("wrong-token");
    session.start();
    await settle();
    expect(session.getStatus()).toBe("auth-failed");
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
    session.start();
    await settle();
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  test("replaceToken clears a rejected state and reconnects with the new token", async () => {
    const session = newSession("wrong-token");
    session.start();
    await settle();
    session.replaceToken(TOKEN);
    await settle();
    expect(session.getStatus()).toBe("live");
  });

  test("the token is never written to a log line", async () => {
    const logged: string[] = [];
    for (const level of ["debug", "info", "warn", "error"] as const) jest.spyOn(logger, level).mockImplementation((_scope: string, message: string, meta?: Record<string, unknown>) => void logged.push(`${message}${JSON.stringify(meta ?? {})}`));
    const session = newSession("wrong-token");
    session.start();
    await settle();
    latestFakeHaSocket().drop();
    expect(logged.join("\n")).not.toContain("wrong-token");
    jest.restoreAllMocks();
  });
});

describe("HaSession state", () => {
  test("a state_changed event updates the entity and notifies its watchers only", async () => {
    fakeHa.states = [haState("light.a", "off"), haState("light.b", "off")];
    const session = newSession();
    const seenA: (string | undefined)[] = [];
    const seenB: (string | undefined)[] = [];
    session.watchEntity("light.a", (entity) => seenA.push(entity?.state));
    session.watchEntity("light.b", (entity) => seenB.push(entity?.state));
    session.start();
    await settle();
    latestFakeHaSocket().pushStateChanged(haState("light.a", "on"), "light.a");
    expect(seenA).toEqual(["off", "on"]);
    expect(seenB).toEqual(["off"]);
    latestFakeHaSocket().pushStateChanged(null, "light.b");
    expect(seenB).toEqual(["off", undefined]);
  });

  test("an event that arrives before the snapshot is applied on top of it, not lost", async () => {
    fakeHa.states = [haState("light.a", "off")];
    const session = newSession();
    session.start();
    for (let round = 0; round < 4; round++) await jest.advanceTimersByTimeAsync(0);
    const ws = latestFakeHaSocket();
    ws.pushStateChanged(haState("light.a", "on"), "light.a");
    await settle();
    expect(session.entity("light.a")?.state).toBe("on");
  });

  test("after a reconnect the socket resubscribes and a fresh snapshot replaces stale state", async () => {
    fakeHa.states = [haState("light.a", "off"), haState("light.gone", "on")];
    const session = newSession();
    const seen: (string | undefined)[] = [];
    const seenGone: (string | undefined)[] = [];
    session.watchEntity("light.a", (entity) => seen.push(entity?.state));
    session.watchEntity("light.gone", (entity) => seenGone.push(entity?.state));
    session.start();
    await settle();
    fakeHa.states = [haState("light.a", "on")];
    latestFakeHaSocket().drop();
    expect(session.getStatus()).toBe("down");
    await jest.advanceTimersByTimeAsync(HA_RECONNECT_BASE_DELAY_MS);
    await settle();
    expect(fakeHa.sockets).toHaveLength(2);
    expect(fakeHa.requestLog).toEqual(["subscribe_events", "get_states", "subscribe_events", "get_states"]);
    expect(session.getStatus()).toBe("live");
    expect(seen).toEqual(["off", "on"]);
    expect(seenGone).toEqual(["on", undefined]);
  });

  test("reconnect delays double up to the cap and reset once live again", async () => {
    const session = newSession();
    session.start();
    await settle();
    (global as unknown as { WebSocket: unknown }).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        queueMicrotask(() => this.onclose?.());
      }
    };
    latestFakeHaSocket().drop();
    await jest.advanceTimersByTimeAsync(HA_RECONNECT_BASE_DELAY_MS);
    expect(MockWebSocket.instances).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(HA_RECONNECT_BASE_DELAY_MS * 2 - 1);
    expect(MockWebSocket.instances).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(3);
    session.stop();
  });
});

describe("HaSession requests and keepalive", () => {
  test("request routes the result by id and rejects with Home Assistant's error message", async () => {
    fakeHa.registryReplies["config/area_registry/list"] = [{ area_id: "k", name: "Kitchen" }];
    const session = newSession();
    session.start();
    await settle();
    const areas = session.request<unknown[]>("config/area_registry/list");
    await settle();
    await expect(areas).resolves.toEqual([{ area_id: "k", name: "Kitchen" }]);
    const failing = session.request("fail/command");
    const outcome = failing.then(() => "resolved", (error: Error) => error.message);
    await settle();
    await expect(outcome).resolves.toBe("Unknown command.");
  });

  test("request rejects while the session is not live", async () => {
    await expect(newSession().request("get_states")).rejects.toThrow(/not connected/);
  });

  test("pings every 30 seconds and stays connected while pongs arrive", async () => {
    const session = newSession();
    session.start();
    await settle();
    for (let ping = 0; ping < 3; ping++) {
      await jest.advanceTimersByTimeAsync(HA_PING_INTERVAL_MS);
      await settle();
    }
    expect(fakeHa.requestLog.filter((type) => type === "ping")).toHaveLength(3);
    expect(session.getStatus()).toBe("live");
    expect(fakeHa.sockets).toHaveLength(1);
  });

  test("a missing pong closes the socket and reconnects", async () => {
    const session = newSession();
    session.start();
    await settle();
    fakeHa.mutePong = true;
    await jest.advanceTimersByTimeAsync(HA_PING_INTERVAL_MS + HA_PONG_TIMEOUT_MS);
    expect(session.getStatus()).toBe("down");
    fakeHa.mutePong = false;
    await jest.advanceTimersByTimeAsync(HA_RECONNECT_BASE_DELAY_MS);
    await settle();
    expect(fakeHa.sockets).toHaveLength(2);
    expect(session.getStatus()).toBe("live");
  });

  test("stop closes the socket and leaves no timers; start opens a fresh connection", async () => {
    const session = newSession();
    session.start();
    await settle();
    session.stop();
    expect(session.getStatus()).toBe("idle");
    expect(jest.getTimerCount()).toBe(0);
    session.start();
    await settle();
    expect(fakeHa.sockets).toHaveLength(2);
    expect(session.getStatus()).toBe("live");
  });
});
