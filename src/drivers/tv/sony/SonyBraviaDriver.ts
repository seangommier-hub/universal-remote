import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { SonyBraviaClient, SonyBraviaConfig } from "./SonyBraviaClient";

const LOG_SCOPE = "SonyBraviaDriver";
const VOLUME_STEP = 2;
// Sean, directly (2026-09-09): "anything that ever gets connect[ed]... the same way wifi works
// where when you only connect once, you never have to reconnect [manually]." Sony has no
// persistent connection to drop (every call is a fresh REST request), but the same failure mode
// exists in a different shape: if refreshState() fails once (device briefly unreachable), the
// driver has no reason to try again on its own — and the UI now disables all controls while
// disconnected (UniversalTvRemote.tsx), so a user could never even trigger a retry by pressing
// a button. Same backoff constants as LgWebOsDriver/SamsungTizenDriver, applied to a periodic
// state re-check instead of a socket reconnect.
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

// Capabilities this driver actually implements against Sony's documented JSON-RPC API. Sony's
// REST API has no method for directional nav/select/back/home/menu — those live in the separate
// IRCC-IP protocol, which is NOT implemented here yet. Do not add those capabilities to a Sony
// device until IRCC-IP is researched and implemented; a device must never claim a capability its
// driver can't actually perform.
const SONY_BRAVIA_CAPABILITIES: CapabilityId[] = ["power", "volumeUp", "volumeDown", "setVolume", "mute", "inputSelection"];

export const SONY_BRAVIA_DRIVER_ID = "sony-bravia";

interface PowerStatus {
  status: "active" | "standby";
}

interface VolumeInfo {
  target: string;
  volume: number;
  mute: boolean;
  maxVolume: number;
  minVolume: number;
}

// Field names not confirmed against one authoritative primary source (Sony's own API reference is
// JS-rendered and didn't yield a schema via fetch) — corroborated via search aggregation and a
// concrete real example (`setPlayContent` called with `{uri: "extInput:hdmi?port=2"}`). `title` is
// the more consistently-referenced field name; `label` is included defensively in case a given
// firmware uses it instead — see parseInputList below.
interface ExternalInputStatus {
  uri?: string;
  title?: string;
  label?: string;
}

function requireConfig(device: Device): SonyBraviaConfig {
  const ipAddress = device.config?.ipAddress;
  const psk = device.config?.psk;
  if (typeof ipAddress !== "string" || typeof psk !== "string") {
    throw new Error(`Device ${device.id} is missing Sony BRAVIA config (config.ipAddress and config.psk) — pair it first`);
  }
  return { ipAddress, psk };
}

function parseHdmiInput(input: string): string {
  const match = /^hdmi(\d+)$/i.exec(input);
  if (!match) {
    throw new Error(`Unrecognized Sony input '${input}' — expected a value like 'hdmi1'`);
  }
  return `extInput:hdmi?port=${match[1]}`;
}

/** A legacy "hdmi1"-style shorthand (the static UI fallback list) still needs translating to a real uri; a value already read off the TV via getCurrentExternalInputsStatus (real-hardware research, 2026-09-10) is already a real uri and is sent through as-is. */
function resolveInputUri(input: string): string {
  return /^hdmi\d+$/i.test(input) ? parseHdmiInput(input) : input;
}

/**
 * Driver for Sony BRAVIA TVs with "IP Control" enabled, against the official REST API
 * (https://pro-bravia.sony.net/remote-display-control/rest-api/). Every device using this
 * driver needs `device.config = { ipAddress, psk }` from the TV's IP Control settings.
 */
export class SonyBraviaDriver implements DeviceDriver {
  id = SONY_BRAVIA_DRIVER_ID;
  displayName = "Sony BRAVIA (REST API)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Real-hardware finding (2026-09-09): a scheduled reconnect's refreshState() can still be
  // in flight when disconnect() runs (e.g. the user removes the device mid-retry) — clearing
  // the timer only stops a retry that hasn't *started* yet, not one already awaiting a response.
  // Without this, that stale call could resolve afterward and resurrect the just-removed
  // device's state as "connected." Bumped only on disconnect() (unlike LG/Samsung's driver,
  // there's no persistent-connection "which attempt is newest" concept here to track on every
  // call — only "was this device explicitly disconnected out from under an in-flight call").
  private generations = new Map<string, number>();
  // Same dedupe as LgWebOsDriver.ts, applied for consistency — Sony's per-request HTTP calls
  // tolerate concurrency far better than LG's SSAP socket (confirmed to hang on a second
  // simultaneous connection, live), but multiple independent triggers now call connect() for one
  // device regardless of protocol, and redundant simultaneous requests are still pure waste.
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return SONY_BRAVIA_CAPABILITIES;
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
    await this.refreshState(device);
    await this.refreshInputList(device);
  }

  // Real-hardware ask (2026-09-10), following the same fix LG got in ADR-HEARTH-027: the UI's
  // Input card previously always showed a guessed hdmi1/hdmi2/hdmi3 fallback — real for a TV with
  // exactly 3 plain HDMI inputs, wrong for any other config (fewer inputs, a component/AV input,
  // TVs number their ports differently). Best-effort: a TV that rejects this call, or has no
  // parseable inputs, just leaves the UI on its existing static fallback rather than failing
  // connect() — see resolveInputUri()'s handling of both list shapes.
  private async refreshInputList(device: Device): Promise<void> {
    try {
      const client = new SonyBraviaClient(requireConfig(device));
      const [rawList] = await client.call<ExternalInputStatus[][]>("avContent", "getCurrentExternalInputsStatus");
      const inputs = (rawList ?? [])
        .filter((entry): entry is ExternalInputStatus & { uri: string } => typeof entry.uri === "string")
        .map((entry) => ({ id: entry.uri, label: entry.title ?? entry.label ?? entry.uri }));
      if (inputs.length > 0) {
        const current = this.states.get(device.id);
        this.setState(device.id, { connection: "connected", values: { ...current?.values, inputs }, lastUpdated: Date.now() });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not read input list for ${device.name}`, { message });
    }
  }

  private scheduleReconnect(device: Device, attempt = 1): void {
    // A retry already in flight for this device (e.g. two commands failed back-to-back) — don't
    // stack a second overlapping timer on top of it.
    if (attempt === 1 && this.reconnectTimers.has(device.id)) return;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);
    logger.warn(LOG_SCOPE, `${device.name} unreachable — retrying in ${delay / 1000}s (attempt ${attempt})`);
    const timer = setTimeout(async () => {
      try {
        await this.refreshState(device);
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
    const client = new SonyBraviaClient(requireConfig(device));
    await this.applyCommand(client, device, command);
    const state = await this.refreshState(device);
    return {
      success: true,
      deviceId: device.id,
      capability: command.capability,
      timestamp: Date.now(),
      state: state.values,
    };
  }

  subscribeToState(device: Device, listener: StateChangeListener): () => void {
    const set = this.listeners.get(device.id) ?? new Set<StateChangeListener>();
    set.add(listener);
    this.listeners.set(device.id, set);
    return () => set.delete(listener);
  }

  private async applyCommand(client: SonyBraviaClient, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "power": {
        const [power] = await client.call<PowerStatus[]>("system", "getPowerStatus");
        await client.call("system", "setPowerStatus", [{ status: power.status !== "active" }]);
        return;
      }
      case "volumeUp":
        await client.call("audio", "setAudioVolume", [{ target: "speaker", volume: `+${VOLUME_STEP}` }]);
        return;
      case "volumeDown":
        await client.call("audio", "setAudioVolume", [{ target: "speaker", volume: `-${VOLUME_STEP}` }]);
        return;
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new Error("setVolume requires a numeric 'volume' arg");
        await client.call("audio", "setAudioVolume", [{ target: "speaker", volume: String(target) }]);
        return;
      }
      case "mute": {
        const [info] = await client.call<VolumeInfo[]>("audio", "getVolumeInformation");
        await client.call("audio", "setAudioMute", [{ status: !info.mute }]);
        return;
      }
      case "inputSelection": {
        const input = command.args?.input;
        if (typeof input !== "string") throw new Error("inputSelection requires a string 'input' arg");
        await client.call("avContent", "setPlayContent", [{ uri: resolveInputUri(input) }]);
        return;
      }
      default:
        throw new Error(`SonyBraviaDriver does not implement capability: ${command.capability}`);
    }
  }

  /** Re-reads power + volume from the TV and updates cached state. Never trusts a command's own result as proof of success — always reads the state back. */
  private async refreshState(device: Device): Promise<DeviceState> {
    const generation = this.generations.get(device.id) ?? 0;
    const client = new SonyBraviaClient(requireConfig(device));
    try {
      const [[power], [volumeInfo]] = await Promise.all([
        client.call<PowerStatus[]>("system", "getPowerStatus"),
        client.call<VolumeInfo[]>("audio", "getVolumeInformation"),
      ]);
      // Real bug found alongside the input-list addition, 2026-09-10: this used to build `values`
      // from scratch every call — fine when the only fields were power/volume/muted (all
      // refreshed here anyway), but refreshInputList's `inputs` field isn't one of them, and
      // executeCommand() calls refreshState() after every single command. Without spreading the
      // existing values first, pressing e.g. volumeUp would silently wipe the input list from
      // state a moment after refreshInputList populated it.
      const current = this.states.get(device.id);
      const state: DeviceState = {
        connection: "connected",
        values: {
          ...current?.values,
          power: power.status === "active" ? "on" : "off",
          volume: volumeInfo.volume,
          muted: volumeInfo.mute,
        },
        lastUpdated: Date.now(),
      };
      // The device may have been explicitly disconnected while this request was in flight —
      // don't resurrect it as "connected" behind the caller's back.
      if (generation !== (this.generations.get(device.id) ?? 0)) return state;
      this.clearReconnectTimer(device.id);
      this.setState(device.id, state);
      return state;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Failed to reach ${device.name} at ${device.config?.ipAddress}`, { message });
      if (generation !== (this.generations.get(device.id) ?? 0)) throw err; // disconnected in the meantime — its own disconnect() already set the right state
      const state: DeviceState = { connection: "disconnected", values: this.states.get(device.id)?.values ?? {}, lastUpdated: Date.now() };
      this.setState(device.id, state);
      this.scheduleReconnect(device); // any failure to reach it — startup or mid-use — starts the auto-retry loop
      throw err;
    }
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
