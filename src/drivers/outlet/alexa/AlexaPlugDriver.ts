import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { withBackoffJitter } from "../../shared/backoffJitter";
import { dedupeInFlight } from "../../shared/inFlightDedupe";
import { listPlugs, setPlugState } from "./AlexaPlugClient";

const LOG_SCOPE = "AlexaPlugDriver";
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

export const ALEXA_PLUG_DRIVER_ID = "alexa-plug";
const PLUG_CAPABILITIES: CapabilityId[] = ["power"];

function requirePlugId(device: Device): string {
  const plugId = device.config?.plugId;
  if (typeof plugId !== "string") {
    throw new Error(`Device ${device.id} is missing Alexa config (config.plugId) — pair it first`);
  }
  return plugId;
}

/**
 * Driver for one Amazon Smart Plug reached through the Family Command Center's Alexa bridge
 * (ADR-HEARTH-192, superseding only the Amazon Smart Plug row of ADR-HEARTH-048's "do not build"
 * research now that a sibling session built a real Pi-side bridge against `alexa-remote2`). Shape
 * mirrors `SmartThingsOutletDriver.ts` deliberately: each plug is its own `Device`,
 * `config.plugId` holding the bridge's own plug id, and every actual Amazon interaction — sign-in,
 * token storage, the unofficial API calls themselves — lives entirely on the Family Command
 * Center side, reached only through `AlexaPlugClient.ts`. Hearth's phone never holds an Amazon
 * credential.
 */
export class AlexaPlugDriver implements DeviceDriver {
  id = ALEXA_PLUG_DRIVER_ID;
  displayName = "Alexa";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return PLUG_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    return dedupeInFlight(this.inFlightConnects, device.id, () => this.doConnect(device));
  }

  private async doConnect(device: Device): Promise<void> {
    const plugId = requirePlugId(device);
    const generation = this.generations.get(device.id) ?? 0;
    this.clearReconnectTimer(device.id);
    try {
      const plugs = await listPlugs();
      const plug = plugs.find((p) => p.id === plugId);
      if (!plug) {
        throw new Error(`Plug ${plugId} isn't in Family Command Center's current Alexa plug list`);
      }
      // A plug Amazon itself reports offline is a real, expected state (the Echo hub is off, the
      // plug lost Wi-Fi, etc.) — treated exactly like any other driver's unreachable device: mark
      // disconnected and let the standard backoff loop below retry, never silently rendered as "on"/"off".
      if (!plug.reachable) {
        throw new Error(`${device.name} isn't reachable through Alexa right now`);
      }
      if (generation !== (this.generations.get(device.id) ?? 0)) return; // disconnected while this was in flight
      // plug.on === null means Amazon hasn't reported a state at all (distinct from a real "off") —
      // values.power is left unset rather than fabricated, the same convention XboxDriver already
      // established for a capability this driver can't query (see UniversalTvRemote.tsx's own
      // `power === "on" || power === "off" ? power : undefined` read of it).
      const values: Record<string, unknown> = plug.on === null ? {} : { power: plug.on ? "on" : "off" };
      this.setState(device.id, { connection: "connected", values, lastUpdated: Date.now() });
    } catch (err) {
      if (generation !== (this.generations.get(device.id) ?? 0)) throw err; // its own disconnect() already set the right state
      this.markDisconnectedAndRetry(device);
      throw err;
    }
  }

  /** Marks the plug disconnected and starts the backoff reconnect loop (connection contract, ADR-HEARTH-171). */
  private markDisconnectedAndRetry(device: Device): void {
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
    this.scheduleReconnect(device);
  }

  private scheduleReconnect(device: Device, attempt = 1): void {
    if (attempt === 1 && this.reconnectTimers.has(device.id)) return;
    const delay = withBackoffJitter(Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS));
    logger.warn(LOG_SCOPE, `${device.name} unreachable — retrying in ${delay / 1000}s (attempt ${attempt})`);
    const timer = setTimeout(async () => {
      try {
        await this.connect(device);
        logger.info(LOG_SCOPE, `${device.name} reachable again after ${attempt} attempt(s)`);
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

  async disconnect(device: Device): Promise<void> {
    this.generations.set(device.id, (this.generations.get(device.id) ?? 0) + 1);
    this.clearReconnectTimer(device.id);
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const plugId = requirePlugId(device);
    if (command.capability !== "power") {
      throw new Error(`AlexaPlugDriver does not implement capability: ${command.capability}`);
    }
    try {
      const current = this.states.get(device.id)?.values.power;
      const next = current === "on" ? "off" : "on";
      await setPlugState(plugId, next);
      this.setState(device.id, { connection: "connected", values: { power: next }, lastUpdated: Date.now() });
    } catch (err) {
      this.markDisconnectedAndRetry(device);
      throw err;
    }
    const state = this.states.get(device.id)!;
    return { success: true, deviceId: device.id, capability: command.capability, timestamp: Date.now(), state: state.values };
  }

  subscribeToState(device: Device, listener: StateChangeListener): () => void {
    const set = this.listeners.get(device.id) ?? new Set<StateChangeListener>();
    set.add(listener);
    this.listeners.set(device.id, set);
    return () => set.delete(listener);
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
