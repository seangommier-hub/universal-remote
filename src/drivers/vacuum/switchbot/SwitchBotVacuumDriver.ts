import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { SwitchBotClient, SwitchBotConfig } from "./SwitchBotClient";

const LOG_SCOPE = "SwitchBotVacuumDriver";
export const SWITCHBOT_VACUUM_DRIVER_ID = "switchbot-vacuum";

// Same backoff shape as every other driver's automatic-reconnect loop (ADR-HEARTH-017) — a cloud
// API is less likely to need it than a flaky LAN socket, but "once connected it should never lose
// connection" is a whole-app standard, not a per-protocol one.
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

// Robot Vacuum Cleaner S1/S1 Plus and Mini Robot Vacuum K10+/K10+ Pro/K11+ all document the
// identical `start`/`stop`/`dock`/`PowLevel` command set — see Capability.ts's vacuumStart entry
// for the full citation and why the newer mop-capable S10/S20/K10+ Pro Combo/K20+ Pro are
// deliberately excluded (different, richer command shape, not implemented here).
const SWITCHBOT_VACUUM_CAPABILITIES: CapabilityId[] = ["vacuumStart", "vacuumStop", "vacuumDock", "setSuctionPower"];

export const SUPPORTED_VACUUM_DEVICE_TYPES = ["S1", "S1 Plus", "K10+", "K10+ Pro", "K11+"];

// Same distinction RokuEcpDriver.ts already established (real-hardware finding, 2026-09-09): a
// thrown argument-validation error (bad setSuctionPower level) never touched the network at all
// and says nothing about whether the vacuum is reachable — executeCommand's catch must not treat
// it as evidence of a dead device, or a single bad argument wrongly flips a healthy device to
// "disconnected" and starts an indefinite reconnect loop against it.
class SwitchBotValidationError extends Error {}

function requireConfig(device: Device): SwitchBotConfig & { deviceId: string } {
  const token = device.config?.token;
  const secret = device.config?.secret;
  const deviceId = device.config?.deviceId;
  if (typeof token !== "string" || typeof secret !== "string" || typeof deviceId !== "string") {
    throw new Error(`Device ${device.id} is missing SwitchBot config (token/secret/deviceId) — pair it first`);
  }
  return { token, secret, deviceId };
}

/**
 * Driver for SwitchBot robot vacuums over SwitchBot's official cloud OpenAPI (ADR-HEARTH-118) —
 * the only driver in this project that talks to a cloud service rather than a LAN device, so
 * there's no IP address, no relay, and no persistent connection to hold open. Each command is one
 * signed HTTPS request, re-reading real status afterward, the same "never assume success" pattern
 * every other driver already follows.
 */
export class SwitchBotVacuumDriver implements DeviceDriver {
  id = SWITCHBOT_VACUUM_DRIVER_ID;
  displayName = "SwitchBot Robot Vacuum (OpenAPI)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private generations = new Map<string, number>();
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return SWITCHBOT_VACUUM_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const existing = this.inFlightConnects.get(device.id);
    if (existing) return existing;
    const attempt = this.doConnect(device);
    this.inFlightConnects.set(device.id, attempt);
    try {
      await attempt;
    } finally {
      if (this.inFlightConnects.get(device.id) === attempt) this.inFlightConnects.delete(device.id);
    }
  }

  private async doConnect(device: Device): Promise<void> {
    const generation = this.generations.get(device.id) ?? 0;
    this.clearReconnectTimer(device.id);
    try {
      const config = requireConfig(device);
      const client = new SwitchBotClient(config);
      const status = await client.getStatus(config.deviceId);
      if (generation !== (this.generations.get(device.id) ?? 0)) return; // disconnected while this was in flight
      this.setState(device.id, {
        connection: "connected",
        values: { workingStatus: status.workingStatus, battery: status.battery, online: status.onlineStatus === "online" },
        lastUpdated: Date.now(),
      });
    } catch (err) {
      if (generation !== (this.generations.get(device.id) ?? 0)) throw err;
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
      this.scheduleReconnect(device);
      throw err;
    }
  }

  private scheduleReconnect(device: Device, attempt = 1): void {
    if (attempt === 1 && this.reconnectTimers.has(device.id)) return;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);
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
    const config = requireConfig(device);
    const client = new SwitchBotClient(config);
    try {
      await this.applyCommand(client, config.deviceId, device, command);
    } catch (err) {
      if (err instanceof SwitchBotValidationError) throw err; // a bad arg, not a dead device — don't touch connection state
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
      this.scheduleReconnect(device);
      throw err;
    }
    const state = this.states.get(device.id) ?? { connection: "connected", values: {}, lastUpdated: Date.now() };
    return { success: true, deviceId: device.id, capability: command.capability, timestamp: Date.now(), state: state.values };
  }

  subscribeToState(device: Device, listener: StateChangeListener): () => void {
    const set = this.listeners.get(device.id) ?? new Set<StateChangeListener>();
    set.add(listener);
    this.listeners.set(device.id, set);
    return () => set.delete(listener);
  }

  private async applyCommand(client: SwitchBotClient, deviceId: string, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "vacuumStart":
        await client.sendCommand(deviceId, "start");
        break;
      case "vacuumStop":
        await client.sendCommand(deviceId, "stop");
        break;
      case "vacuumDock":
        await client.sendCommand(deviceId, "dock");
        break;
      case "setSuctionPower": {
        const level = command.args?.level;
        if (typeof level !== "number" || level < 0 || level > 3 || !Number.isInteger(level)) {
          throw new SwitchBotValidationError("setSuctionPower requires an integer 'level' arg between 0 and 3");
        }
        await client.sendCommand(deviceId, "PowLevel", level);
        break;
      }
      default:
        throw new Error(`SwitchBotVacuumDriver does not implement capability: ${command.capability}`);
    }
    // Re-read real status after every command — a vacuum's own `workingStatus` reflects what it's
    // actually doing far better than an optimistic local guess (e.g. `dock` while a bin-emptying
    // cycle is in progress reports `InDustCollecting`, not an immediate `Charging`).
    await this.refreshStatus(device, client, deviceId);
  }

  private async refreshStatus(device: Device, client: SwitchBotClient, deviceId: string): Promise<void> {
    try {
      const status = await client.getStatus(deviceId);
      this.patchValues(device.id, { workingStatus: status.workingStatus, battery: status.battery, online: status.onlineStatus === "online" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not read back status for ${device.name} after command`, { message });
    }
  }

  private patchValues(deviceId: string, patch: DeviceState["values"]): void {
    const current = this.states.get(deviceId);
    this.setState(deviceId, { connection: "connected", values: { ...current?.values, ...patch }, lastUpdated: Date.now() });
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
