import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId, NavigationDirection } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { SamsungTizenClient, SamsungTizenConfig } from "./SamsungTizenClient";
import { sendDigitSequence } from "../../../core/util/sendDigitSequence";
import { logger } from "../../../core/logging/logger";

const LOG_SCOPE = "SamsungTizenDriver";
// See LgWebOsDriver.ts's identical constants — same "invisible reconnect, not a permanently
// dead device" behavior Sean asked for, applied to both WebSocket-based TV drivers.
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

export const SAMSUNG_TIZEN_DRIVER_ID = "samsung-tizen-ws8001";

// Unlike SonyBraviaDriver, this protocol is key-press emulation only — there is no documented
// query method to read back real power/volume/state from the TV. State here is therefore
// OPTIMISTIC (assumed from the command just sent), not verified. UI code must not treat
// Samsung state with the same confidence as Sony's. inputSelection (jump directly to a named
// input) is intentionally excluded: the protocol only has a generic "open source menu" key
// (KEY_SOURCE, see openSourceList below), not a way to jump to a specific input (see
// ADR-HEARTH-005 and ADR-HEARTH-027).
const SAMSUNG_CAPABILITIES: CapabilityId[] = [
  "power",
  "volumeUp",
  "volumeDown",
  "mute",
  "channelUp",
  "channelDown",
  "directionalNavigation",
  "select",
  "back",
  "home",
  "menu",
  "setChannel",
  // Verified against the documented Tizen remote key-code list (real-hardware ask, 2026-09-10):
  // KEY_SLEEP ("SleepTimer") and KEY_TOOLS (opens the quick-settings panel) are both real,
  // separate keys — not fabricated to satisfy the request. See Capability.ts for the cross-driver
  // research note (LG/Roku genuinely have no equivalent through their own public APIs).
  "sleepTimer",
  "settings",
  // "KEY_SOURCE|Source" — confirmed in the same documented key list. Opens the TV's own
  // on-screen source picker; the user then drives it with the directionalNavigation/select this
  // driver already has, same as any other on-screen menu. See Capability.ts and ADR-HEARTH-027
  // for why this isn't just inputSelection under a different name.
  "openSourceList",
];

const DIRECTION_KEYS: Record<NavigationDirection, string> = {
  up: "KEY_UP",
  down: "KEY_DOWN",
  left: "KEY_LEFT",
  right: "KEY_RIGHT",
};

function requireConfig(device: Device): SamsungTizenConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Samsung config (config.ipAddress) — pair it first`);
  }
  return { ipAddress, appName: "Hearth" };
}

function keyCodeFor(command: Command): string {
  switch (command.capability) {
    case "power":
      return "KEY_POWER";
    case "volumeUp":
      return "KEY_VOLUP";
    case "volumeDown":
      return "KEY_VOLDOWN";
    case "mute":
      return "KEY_MUTE";
    case "channelUp":
      return "KEY_CHUP";
    case "channelDown":
      return "KEY_CHDOWN";
    case "select":
      return "KEY_ENTER";
    case "back":
      return "KEY_RETURN";
    case "home":
      return "KEY_HOME";
    case "menu":
      return "KEY_MENU";
    case "settings":
      return "KEY_TOOLS";
    case "sleepTimer":
      return "KEY_SLEEP";
    case "openSourceList":
      return "KEY_SOURCE";
    case "directionalNavigation": {
      const direction = command.args?.direction as NavigationDirection | undefined;
      if (!direction || !(direction in DIRECTION_KEYS)) {
        throw new Error("directionalNavigation requires a valid 'direction' arg");
      }
      return DIRECTION_KEYS[direction];
    }
    default:
      throw new Error(`SamsungTizenDriver does not implement capability: ${command.capability}`);
  }
}

function optimisticValuesAfter(command: Command, current: DeviceState["values"]): DeviceState["values"] {
  if (command.capability === "power") {
    return { ...current, power: current.power === "on" ? "off" : "on" };
  }
  if (command.capability === "mute") {
    return { ...current, muted: !current.muted };
  }
  return { ...current, lastAction: command.capability };
}

/**
 * Driver for Samsung Tizen TVs over the unencrypted community remote-control WebSocket
 * protocol. Requires the TV to accept ws://<ip>:8001 (see ADR-HEARTH-005) — not guaranteed on
 * newer firmware that may only accept the encrypted wss://8002 path.
 */
export class SamsungTizenDriver implements DeviceDriver {
  id = SAMSUNG_TIZEN_DRIVER_ID;
  displayName = "Samsung Tizen TV (WebSocket, unencrypted)";

  private clients = new Map<string, SamsungTizenClient>();
  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // See LgWebOsDriver.ts's identical generation-counter comment — same race (multiple
  // independent connect() call sites for one device; a stale or superseded attempt could
  // otherwise resurrect state or kill a healthy newer connection) applies equally here.
  private generations = new Map<string, number>();
  // See LgWebOsDriver.ts's identical, live-confirmed comment: a second simultaneous connection
  // attempt to the same TV can hang until timeout instead of being rejected, since multiple
  // independent triggers now call connect() for one device. A single in-flight promise per
  // device stops the redundant attempt from ever being made, not just cleaning it up after.
  private inFlightConnects = new Map<string, Promise<void>>();

  private bumpGeneration(deviceId: string): number {
    const next = (this.generations.get(deviceId) ?? 0) + 1;
    this.generations.set(deviceId, next);
    return next;
  }

  private isCurrentGeneration(deviceId: string, generation: number): boolean {
    return this.generations.get(deviceId) === generation;
  }

  getCapabilities(): CapabilityId[] {
    return SAMSUNG_CAPABILITIES;
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
    this.clearReconnectTimer(device.id);
    const generation = this.bumpGeneration(device.id);
    const client = new SamsungTizenClient(requireConfig(device));
    await client.connect();
    if (!this.isCurrentGeneration(device.id, generation)) {
      client.close();
      return;
    }
    client.onDisconnect = () => {
      if (this.clients.get(device.id) === client) this.handleUnexpectedDisconnect(device);
    };
    const previous = this.clients.get(device.id);
    if (previous && previous !== client) previous.close();
    this.clients.set(device.id, client);
    this.setState(device.id, { connection: "connected", values: {}, lastUpdated: Date.now() });
  }

  private handleUnexpectedDisconnect(device: Device, attempt = 1): void {
    this.clients.delete(device.id);
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });

    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);
    logger.warn(LOG_SCOPE, `${device.name} disconnected unexpectedly — retrying in ${delay / 1000}s (attempt ${attempt})`);
    const timer = setTimeout(async () => {
      try {
        await this.connect(device);
        logger.info(LOG_SCOPE, `${device.name} auto-reconnected after ${attempt} attempt(s)`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(LOG_SCOPE, `Auto-reconnect attempt ${attempt} for ${device.name} failed`, { message });
        this.handleUnexpectedDisconnect(device, attempt + 1);
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
    this.bumpGeneration(device.id);
    this.clearReconnectTimer(device.id);
    this.clients.get(device.id)?.close();
    this.clients.delete(device.id);
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const client = this.clients.get(device.id);
    if (!client) {
      throw new Error(`Device ${device.id} is not connected — call connect() before sending commands`);
    }
    const current = this.states.get(device.id)?.values ?? {};

    if (command.capability === "setChannel") {
      const channel = command.args?.channel;
      if (typeof channel !== "number") throw new Error("setChannel requires a numeric 'channel' arg");
      // Digit key codes are KEY_0..KEY_9 — sourced from xchwarze/samsung-tv-ws-api's documented
      // "Number Keys" section, sent one per digit the same way every other key press is sent.
      await sendDigitSequence(channel, async (digit) => client.sendKey(`KEY_${digit}`));
      const values = { ...current, channel };
      this.setState(device.id, { connection: "connected", values, lastUpdated: Date.now() });
      return { success: true, deviceId: device.id, capability: command.capability, timestamp: Date.now(), state: values };
    }

    const keyCode = keyCodeFor(command);
    client.sendKey(keyCode);

    const values = optimisticValuesAfter(command, current);
    const state: DeviceState = { connection: "connected", values, lastUpdated: Date.now() };
    this.setState(device.id, state);

    return {
      success: true,
      deviceId: device.id,
      capability: command.capability,
      timestamp: Date.now(),
      state: values,
    };
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
