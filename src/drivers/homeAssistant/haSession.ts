import { logger } from "../../core/logging/logger";
import { withBackoffJitter } from "../shared/backoffJitter";
import { HomeAssistantEntity } from "./HomeAssistantClient";
import { HaMessage, HaSocket, HaSocketFactory } from "./haSocket";

const LOG_SCOPE = "haSession";
export const HA_PING_INTERVAL_MS = 30_000;
export const HA_PONG_TIMEOUT_MS = 10_000;
export const HA_REQUEST_TIMEOUT_MS = 15_000;
export const HA_RECONNECT_BASE_DELAY_MS = 2000;
export const HA_RECONNECT_MAX_DELAY_MS = 30_000;
export const HA_TOKEN_REJECTED_MESSAGE = "Home Assistant rejected the access token. Create a new long-lived access token and sync again.";

/** idle: not started or paused; connecting: socket/handshake/snapshot in progress; live: subscribed with a fresh snapshot; down: lost, retrying; auth-failed: token rejected, not retrying. */
export type HaSessionStatus = "idle" | "connecting" | "live" | "down" | "auth-failed";

/** A Home Assistant request that got an error result or never got an answer. */
export class HaSessionError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "HaSessionError";
  }
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type EntityWatcher = (entity: HomeAssistantEntity | undefined) => void;

export interface HaSessionOptions {
  baseUrl: string;
  token: string;
  createSocket?: HaSocketFactory;
}

/**
 * One authenticated WebSocket to one Home Assistant server (ADR-HEARTH-175): id-routed requests, a single
 * state_changed subscription, a get_states snapshot after every (re)connect, a ping/pong watchdog and
 * jittered reconnects. A rejected token stops retrying. Entity state fans out to whoever watches an entity id.
 */
export class HaSession {
  private status: HaSessionStatus = "idle";
  private socket: HaSocket | null = null;
  private wanted = false;
  private attempt = 0;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private entities = new Map<string, HomeAssistantEntity>();
  private watchers = new Map<string, Set<EntityWatcher>>();
  private statusListeners = new Set<(status: HaSessionStatus) => void>();
  private eventSubscriptionId: number | null = null;
  private bufferedEvents: HaMessage[] | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private pingId: number | null = null;

  constructor(private options: HaSessionOptions) {}

  /** Swaps in a new access token: drops the current connection, clears a rejected-token state and reconnects if the session was in use. */
  replaceToken(token: string): void {
    const wasWanted = this.wanted || this.status === "auth-failed";
    this.options = { ...this.options, token };
    this.stop();
    if (this.status === "auth-failed") this.status = "idle";
    if (wasWanted) this.start();
  }

  /** The current connection status. */
  getStatus(): HaSessionStatus {
    return this.status;
  }

  /** The current state of an entity from the last snapshot plus events, or undefined when unknown. */
  entity(entityId: string): HomeAssistantEntity | undefined {
    return this.entities.get(entityId);
  }

  /** Every entity from the last snapshot plus events. */
  allEntities(): HomeAssistantEntity[] {
    return Array.from(this.entities.values());
  }

  /** Begins connecting (no-op when already started); stays wanted until stop(). */
  start(): void {
    if (this.wanted || this.status === "auth-failed") return;
    this.wanted = true;
    this.connect();
  }

  /** Closes the socket and cancels every timer; the session can be start()ed again. */
  stop(): void {
    this.wanted = false;
    this.clearReconnectTimer();
    this.dropSocket(new HaSessionError("Home Assistant session stopped"));
    this.setStatus(this.status === "auth-failed" ? "auth-failed" : "idle");
  }

  /** Sends one request and resolves with its result; rejects when the session is not live or Home Assistant answers with an error. */
  request<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
    return this.send<T>(type, payload, false);
  }

  /** Calls back with the entity's state now and on every change or resnapshot; returns the unsubscribe. */
  watchEntity(entityId: string, watcher: EntityWatcher): () => void {
    const set = this.watchers.get(entityId) ?? new Set<EntityWatcher>();
    set.add(watcher);
    this.watchers.set(entityId, set);
    return () => set.delete(watcher);
  }

  /** Calls back on every status change; returns the unsubscribe. */
  onStatus(listener: (status: HaSessionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private connect(): void {
    this.setStatus("connecting");
    const socket = new HaSocket(
      this.options.baseUrl,
      this.options.token,
      {
        onAuthenticated: () => void this.bootstrap(socket),
        onAuthInvalid: () => this.handleTokenRejected(socket),
        onMessage: (message) => this.route(message),
        onClosed: () => this.handleClosed(socket),
      },
      this.options.createSocket
    );
    this.socket = socket;
    socket.open();
  }

  private async bootstrap(socket: HaSocket): Promise<void> {
    try {
      this.bufferedEvents = [];
      this.eventSubscriptionId = this.nextId;
      await this.send("subscribe_events", { event_type: "state_changed" }, true);
      const states = await this.send<HomeAssistantEntity[]>("get_states", {}, true);
      if (this.socket !== socket) return;
      this.applySnapshot(states);
      this.attempt = 0;
      this.startPing();
      this.setStatus("live");
    } catch (error) {
      if (this.socket !== socket) return;
      logger.warn(LOG_SCOPE, "Home Assistant session setup failed", { error: String(error) });
      this.handleClosed(socket);
    }
  }

  private applySnapshot(states: HomeAssistantEntity[]): void {
    const previous = new Set(this.entities.keys());
    this.entities = new Map(states.map((entity) => [entity.entity_id, entity]));
    const buffered = this.bufferedEvents ?? [];
    this.bufferedEvents = null;
    buffered.forEach((message) => this.applyStateChanged(message, false));
    new Set([...previous, ...this.entities.keys()]).forEach((entityId) => this.notify(entityId));
  }

  private route(message: HaMessage): void {
    if (message.type === "event" && message.id === this.eventSubscriptionId) {
      if (this.bufferedEvents) this.bufferedEvents.push(message);
      else this.applyStateChanged(message, true);
      return;
    }
    if (message.type === "pong" && message.id === this.pingId) {
      this.clearPongTimer();
      return;
    }
    if (typeof message.id !== "number") return;
    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.type === "result" && message.success === false) {
      const error = (message.error ?? {}) as { code?: string; message?: string };
      request.reject(new HaSessionError(error.message ?? "Home Assistant returned an error", error.code));
    } else {
      request.resolve(message.result);
    }
  }

  private applyStateChanged(message: HaMessage, notify: boolean): void {
    const data = (message.event as { data?: { entity_id?: string; new_state?: HomeAssistantEntity | null } } | undefined)?.data;
    const entityId = data?.entity_id;
    if (typeof entityId !== "string") return;
    if (data?.new_state) this.entities.set(entityId, data.new_state);
    else this.entities.delete(entityId);
    if (notify) this.notify(entityId);
  }

  private notify(entityId: string): void {
    const entity = this.entities.get(entityId);
    this.watchers.get(entityId)?.forEach((watcher) => watcher(entity));
  }

  private send<T>(type: string, payload: Record<string, unknown>, duringSetup: boolean): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.socket || (!duringSetup && this.status !== "live")) {
        reject(new HaSessionError("Home Assistant is not connected"));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HaSessionError(`Home Assistant did not answer ${type}`));
      }, HA_REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as (result: unknown) => void, reject, timer });
      if (!this.socket.send({ id, type, ...payload })) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new HaSessionError("Home Assistant is not connected"));
      }
    });
  }

  private handleTokenRejected(socket: HaSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.wanted = false;
    this.dropSocket(new HaSessionError(HA_TOKEN_REJECTED_MESSAGE));
    this.setStatus("auth-failed");
  }

  private handleClosed(socket: HaSocket): void {
    if (this.socket !== socket) return;
    this.dropSocket(new HaSessionError("Home Assistant connection lost"));
    if (!this.wanted) {
      this.setStatus("idle");
      return;
    }
    this.setStatus("down");
    this.scheduleReconnect();
  }

  private dropSocket(reason: Error): void {
    this.stopPing();
    const socket = this.socket;
    this.socket = null;
    this.eventSubscriptionId = null;
    this.bufferedEvents = null;
    socket?.close();
    this.pending.forEach((request) => {
      clearTimeout(request.timer);
      request.reject(reason);
    });
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    this.attempt += 1;
    const delay = withBackoffJitter(Math.min(HA_RECONNECT_BASE_DELAY_MS * 2 ** (this.attempt - 1), HA_RECONNECT_MAX_DELAY_MS));
    logger.warn(LOG_SCOPE, `Home Assistant socket down, retrying in ${delay / 1000}s (attempt ${this.attempt})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wanted) this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.sendPing(), HA_PING_INTERVAL_MS);
  }

  private sendPing(): void {
    if (this.pongTimer || !this.socket) return;
    const id = this.nextId++;
    this.pingId = id;
    if (!this.socket.send({ id, type: "ping" })) return;
    const socket = this.socket;
    this.pongTimer = setTimeout(() => {
      logger.warn(LOG_SCOPE, "Home Assistant did not answer ping, reconnecting");
      this.handleClosed(socket);
    }, HA_PONG_TIMEOUT_MS);
  }

  private clearPongTimer(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
    this.pingId = null;
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.clearPongTimer();
  }

  private setStatus(next: HaSessionStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.statusListeners.forEach((listener) => listener(next));
  }
}
