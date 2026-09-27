import { DeviceDriver, StateChangeListener } from "../../core/drivers/DeviceDriver";
import { logger } from "../../core/logging/logger";
import { CapabilityId } from "../../core/types/Capability";
import { Command, CommandResult } from "../../core/types/Command";
import { Device } from "../../core/types/Device";
import { DeviceState } from "../../core/types/DeviceState";
import { withBackoffJitter } from "../shared/backoffJitter";
import { HomeAssistantClient, HomeAssistantEntity } from "./HomeAssistantClient";
import { HaCommandValidationError, commandToServiceCall } from "./haCommandMapping";
import { resolveHaTarget } from "./haDeviceConfig";
import { HaInstance } from "./haInstance";
import { releaseSession, startSession } from "./haInstanceHub";
import { HA_TOKEN_REJECTED_MESSAGE, HaSession, HaSessionStatus } from "./haSession";
import { entityToValues } from "./haStateMapping";

const LOG_SCOPE = "HomeAssistantDriver";
export const HOME_ASSISTANT_DRIVER_ID = "home-assistant";
/** Fallback polling period, used only while the WebSocket session is not live. */
export const HOME_ASSISTANT_POLL_INTERVAL_MS = 10_000;
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30_000;

// Everything any Home Assistant entity can offer; each imported Device keeps only the subset its own
// entity supports (ADR-HEARTH-166), so this is the ceiling, not a promise for every device.
const HOME_ASSISTANT_CAPABILITIES: CapabilityId[] = [
  "power", "powerOn", "powerOff", "setBrightness", "setColor", "setVolume", "volumeUp", "volumeDown", "mute",
  "playPause", "inputSelection", "directionalNavigation", "select", "back", "home", "menu",
];

interface LiveLink {
  unwatchEntity: () => void;
  unwatchStatus: () => void;
  session: HaSession;
  instance: HaInstance;
}

function clientFor(device: Device): HomeAssistantClient {
  const { instance } = resolveHaTarget(device);
  return new HomeAssistantClient({ baseUrl: instance.baseUrl, token: instance.token });
}

/**
 * Driver for one Home Assistant entity (switch, light, media_player or remote), all sharing one credential and
 * one WebSocket session per server (ADR-HEARTH-175). While the session is live, state arrives by push; while it is
 * down (or before it connects) the driver falls back to REST polling every ~10 seconds (ADR-HEARTH-166), only while
 * something is subscribed, so an idle device makes no requests.
 */
export class HomeAssistantDriver implements DeviceDriver {
  id = HOME_ASSISTANT_DRIVER_ID;
  displayName = "Home Assistant";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private devices = new Map<string, Device>();
  private pollTimers = new Map<string, ReturnType<typeof setInterval>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();
  private links = new Map<string, LiveLink>();

  getCapabilities(): CapabilityId[] {
    return HOME_ASSISTANT_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    return this.runConnect(device, true);
  }

  private async runConnect(device: Device, scheduleRetryOnFailure: boolean): Promise<void> {
    const existing = this.inFlightConnects.get(device.id);
    if (existing) return existing;
    const attempt = this.doConnect(device, scheduleRetryOnFailure);
    this.inFlightConnects.set(device.id, attempt);
    try {
      await attempt;
    } finally {
      if (this.inFlightConnects.get(device.id) === attempt) this.inFlightConnects.delete(device.id);
    }
  }

  async disconnect(device: Device): Promise<void> {
    this.generations.set(device.id, this.generationOf(device.id) + 1);
    this.clearReconnectTimer(device.id);
    this.stopPolling(device.id);
    this.unlink(device.id);
    this.setDisconnected(device.id);
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const { entityId } = resolveHaTarget(device);
    const call = commandToServiceCall(command, entityId, this.states.get(device.id)?.values ?? {});
    const client = clientFor(device);
    try {
      await client.callService(call.domain, call.service, call.data);
      await this.refresh(device, client);
    } catch (err) {
      if (err instanceof HaCommandValidationError) throw err;
      this.markUnreachable(device);
      throw err;
    }
    const state = this.states.get(device.id)!;
    return { success: true, deviceId: device.id, capability: command.capability, timestamp: Date.now(), state: state.values };
  }

  subscribeToState(device: Device, listener: StateChangeListener): () => void {
    const set = this.listeners.get(device.id) ?? new Set<StateChangeListener>();
    set.add(listener);
    this.listeners.set(device.id, set);
    this.devices.set(device.id, device);
    this.ensureLink(device);
    this.ensurePolling(device.id);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.stopPolling(device.id);
        this.unlink(device.id);
      }
    };
  }

  private generationOf(deviceId: string): number {
    return this.generations.get(deviceId) ?? 0;
  }

  private async doConnect(device: Device, scheduleRetryOnFailure: boolean): Promise<void> {
    const generation = this.generationOf(device.id);
    this.devices.set(device.id, device);
    this.clearReconnectTimer(device.id);
    try {
      await this.refresh(device, clientFor(device));
      if (generation !== this.generationOf(device.id)) return;
      this.ensureLink(device);
      this.ensurePolling(device.id);
    } catch (err) {
      if (generation !== this.generationOf(device.id)) throw err;
      this.stopPolling(device.id);
      this.setDisconnected(device.id);
      if (scheduleRetryOnFailure) this.scheduleReconnect(device);
      throw err;
    }
  }

  private async refresh(device: Device, client: HomeAssistantClient): Promise<void> {
    const { entityId } = resolveHaTarget(device);
    this.applyEntity(device.id, await client.getEntity(entityId));
  }

  private applyEntity(deviceId: string, entity: HomeAssistantEntity): void {
    this.setState(deviceId, { connection: "connected", values: entityToValues(entity), lastUpdated: Date.now() });
  }

  // Joins the instance's shared session (one subscription for every device on it) and follows this entity.
  private ensureLink(device: Device): void {
    if ((this.listeners.get(device.id)?.size ?? 0) === 0 || this.links.has(device.id)) return;
    const { instance, entityId } = resolveHaTarget(device);
    const session = startSession(instance);
    const unwatchEntity = session.watchEntity(entityId, (entity) => this.onSessionEntity(device, entity));
    const unwatchStatus = session.onStatus((status) => this.onSessionStatus(device, status));
    this.links.set(device.id, { unwatchEntity, unwatchStatus, session, instance });
  }

  private unlink(deviceId: string): void {
    const link = this.links.get(deviceId);
    if (!link) return;
    link.unwatchEntity();
    link.unwatchStatus();
    releaseSession(link.instance);
    this.links.delete(deviceId);
  }

  private onSessionEntity(device: Device, entity: HomeAssistantEntity | undefined): void {
    this.applyEntity(device.id, entity ?? { entity_id: resolveHaTarget(device).entityId, state: "unavailable", attributes: {} });
  }

  private onSessionStatus(device: Device, status: HaSessionStatus): void {
    if (status === "auth-failed") {
      this.stopPolling(device.id);
      this.clearReconnectTimer(device.id);
      logger.warn(LOG_SCOPE, `${device.name}: Home Assistant rejected the access token`);
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: { ...(current?.values ?? {}), authError: HA_TOKEN_REJECTED_MESSAGE }, lastUpdated: Date.now() });
      return;
    }
    if (status === "live") this.stopPolling(device.id);
    else this.ensurePolling(device.id);
  }

  private isSessionLive(deviceId: string): boolean {
    return this.links.get(deviceId)?.session.getStatus() === "live";
  }

  private ensurePolling(deviceId: string): void {
    const device = this.devices.get(deviceId);
    const hasListeners = (this.listeners.get(deviceId)?.size ?? 0) > 0;
    if (!device || !hasListeners || this.pollTimers.has(deviceId) || this.isSessionLive(deviceId)) return;
    if (this.states.get(deviceId)?.connection !== "connected") return;
    if (this.links.get(deviceId)?.session.getStatus() === "auth-failed") return;
    this.pollTimers.set(deviceId, setInterval(() => void this.poll(device), HOME_ASSISTANT_POLL_INTERVAL_MS));
  }

  private async poll(device: Device): Promise<void> {
    const generation = this.generationOf(device.id);
    try {
      await this.refresh(device, clientFor(device));
    } catch {
      if (generation === this.generationOf(device.id)) this.markUnreachable(device);
    }
  }

  private markUnreachable(device: Device): void {
    this.stopPolling(device.id);
    this.setDisconnected(device.id);
    this.scheduleReconnect(device);
  }

  private stopPolling(deviceId: string): void {
    const timer = this.pollTimers.get(deviceId);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(deviceId);
    }
  }

  private scheduleReconnect(device: Device, attempt = 1): void {
    if (attempt === 1 && this.reconnectTimers.has(device.id)) return;
    const delay = withBackoffJitter(Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS));
    logger.warn(LOG_SCOPE, `${device.name} unreachable — retrying in ${delay / 1000}s (attempt ${attempt})`);
    const timer = setTimeout(async () => {
      try {
        await this.runConnect(device, false);
      } catch {
        this.scheduleReconnect(device, attempt + 1);
      }
    }, delay);
    this.reconnectTimers.set(device.id, timer);
  }

  private clearReconnectTimer(deviceId: string): void {
    const timer = this.reconnectTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(deviceId);
    }
  }

  private setDisconnected(deviceId: string): void {
    const current = this.states.get(deviceId);
    this.setState(deviceId, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
