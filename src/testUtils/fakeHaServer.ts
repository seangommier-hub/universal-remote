import { HomeAssistantEntity } from "../drivers/homeAssistant/HomeAssistantClient";
import { MockWebSocket } from "./mockWebSocket";

// A scripted Home Assistant WebSocket endpoint for tests (message shapes from
// https://developers.home-assistant.io/docs/api/websocket): sends auth_required on connect, checks the token,
// answers subscribe_events / get_states / ping / registry lists, and can push state_changed events.

export interface FakeHaServerState {
  token: string;
  states: HomeAssistantEntity[];
  registryReplies: Record<string, unknown>;
  /** When true, ping is never answered (a silently dead connection). */
  mutePong: boolean;
  /** Every request type received, in order, across all connections. */
  requestLog: string[];
  sockets: FakeHaWebSocket[];
}

export const fakeHa: FakeHaServerState = { token: "test-token", states: [], registryReplies: {}, mutePong: false, requestLog: [], sockets: [] };

/** A MockWebSocket that behaves like a Home Assistant server once created. */
export class FakeHaWebSocket extends MockWebSocket {
  subscriptionId: number | null = null;

  constructor(url: string) {
    super(url);
    fakeHa.sockets.push(this);
    queueMicrotask(() => this.simulateMessage({ type: "auth_required", ha_version: "2026.1.0" }));
  }

  send(data: string): void {
    super.send(data);
    const message = JSON.parse(data) as { id?: number; type: string; access_token?: string; event_type?: string };
    queueMicrotask(() => this.answer(message));
  }

  /** Simulates the server or network dropping this connection. */
  drop(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  /** Pushes a state_changed event to this connection's subscription. */
  pushStateChanged(entity: HomeAssistantEntity | null, entityId: string): void {
    if (this.subscriptionId === null) return;
    this.simulateMessage({ id: this.subscriptionId, type: "event", event: { event_type: "state_changed", data: { entity_id: entityId, new_state: entity } } });
  }

  private answer(message: { id?: number; type: string; access_token?: string; event_type?: string }): void {
    if (message.type === "auth") {
      this.simulateMessage(message.access_token === fakeHa.token ? { type: "auth_ok", ha_version: "2026.1.0" } : { type: "auth_invalid", message: "Invalid access token" });
      return;
    }
    fakeHa.requestLog.push(message.type);
    if (message.type === "subscribe_events") this.subscriptionId = message.id ?? null;
    if (message.type === "ping") {
      if (!fakeHa.mutePong) this.simulateMessage({ id: message.id, type: "pong" });
      return;
    }
    if (message.type.startsWith("fail/")) {
      this.simulateMessage({ id: message.id, type: "result", success: false, error: { code: "unknown_command", message: "Unknown command." } });
      return;
    }
    const result = message.type === "get_states" ? fakeHa.states : message.type in fakeHa.registryReplies ? fakeHa.registryReplies[message.type] : null;
    this.simulateMessage({ id: message.id, type: "result", success: true, result });
  }
}

/** Latest connection the fake server has accepted. */
export function latestFakeHaSocket(): FakeHaWebSocket {
  const socket = fakeHa.sockets[fakeHa.sockets.length - 1];
  if (!socket) throw new Error("No connection has been opened to the fake Home Assistant yet");
  return socket;
}

/** Installs the fake as the global WebSocket and resets its state. */
export function installFakeHaServer(token = "test-token"): void {
  MockWebSocket.reset();
  Object.assign(fakeHa, { token, states: [], registryReplies: {}, mutePong: false, requestLog: [], sockets: [] });
  (global as unknown as { WebSocket: unknown }).WebSocket = FakeHaWebSocket;
}

/** Shorthand for a Home Assistant state object. */
export function haState(entityId: string, state: string, attributes: Record<string, unknown> = {}): HomeAssistantEntity {
  return { entity_id: entityId, state, attributes };
}
