import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId, NavigationDirection, StreamingService } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState, PlaybackState } from "../../../core/types/DeviceState";
import { logger } from "../../../core/logging/logger";
import { RokuEcpClient, RokuEcpConfig } from "./RokuEcpClient";
import { sendDigitSequence } from "../../../core/util/sendDigitSequence";

const LOG_SCOPE = "RokuEcpDriver";
export const ROKU_ECP_DRIVER_ID = "roku-ecp";
// Same "connect once, never manually reconnect" behavior as SonyBraviaDriver/LgWebOsDriver —
// see SonyBraviaDriver.ts for the fuller rationale.
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;

// No "power"/"powerOn" — Roku's documented key list has only "PowerOff", no power-on key (waking
// a fully-off device isn't exposed by ECP). No "setVolume" — volume keys are relative
// (VolumeUp/VolumeDown) only, no absolute-value command. No "menu" — Roku's key list has no
// confirmed menu/options key mapping. inputSelection IS included, unlike the TV drivers: ECP
// documents explicit InputTuner/InputHDMI1-4/InputAV1 keys, so this one is real, not a gap.
// See ADR-HEARTH-007.
const ROKU_CAPABILITIES: CapabilityId[] = [
  "powerOff",
  "volumeUp",
  "volumeDown",
  "mute",
  "channelUp",
  "channelDown",
  "directionalNavigation",
  "select",
  "back",
  "home",
  "inputSelection",
  "setChannel",
  "launchApp",
  // Real-hardware research (2026-09-12, ADR-HEARTH-051): GET /query/media-player and the "Play"
  // remote key are both documented directly by Roku itself — see Capability.ts's playPause entry
  // for the full citation. Real, not assumed.
  "playPause",
];

// See Capability.ts's playPause entry for the citation. Anything other than the two states Roku's
// own docs/community clients actually recognize collapses to "stopped" — deliberately coarse
// rather than guessing at undocumented values like "close"/"buffer"/"startup".
function normalizePlaybackState(rawState: string | undefined): PlaybackState {
  if (rawState === "play") return "playing";
  if (rawState === "pause") return "paused";
  return "stopped";
}

const DIRECTION_KEYS: Record<NavigationDirection, string> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
};

// Real, public Roku channel IDs — confirmed 2026-09-10, not guessed. Roku doesn't publish these
// in its own ECP docs, but they're stable, widely-corroborated identifiers for each channel's
// production listing (the same ID `/launch/<id>` and `/query/icon/<id>` use across the ecosystem).
const ROKU_CHANNEL_IDS: Record<StreamingService, string> = {
  netflix: "12",
  hulu: "2285",
  primeVideo: "13",
  youtube: "837",
};

function requireConfig(device: Device): RokuEcpConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Roku config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

function inputKeyFor(input: string): string {
  if (input === "tuner") return "InputTuner";
  if (input === "av1") return "InputAV1";
  const match = /^hdmi([1-4])$/i.exec(input);
  if (match) return `InputHDMI${match[1]}`;
  throw new RokuValidationError(`Unrecognized Roku input '${input}' — expected 'tuner', 'av1', or 'hdmi1'..'hdmi4'`);
}

// Real-hardware finding (2026-09-09): executeCommand's catch treats *any* thrown error as
// evidence the device is unreachable — but applyCommand also throws for pure argument
// validation (a bad direction/channel/input string) that never touches the network at all. A
// caller sending a malformed command was flipping a perfectly healthy device to "disconnected"
// and starting an indefinite reconnect loop against it. Confirmed live: this project's own test
// suite (RokuEcpDriver.test.ts's "directionalNavigation without a valid direction" test)
// triggered exactly this, leaving real timers running after the test completed. A distinct error
// type lets executeCommand tell the two apart without string-matching error messages.
class RokuValidationError extends Error {}

/**
 * Driver for Roku streaming devices and Roku TVs (they share the same ECP interface) over
 * plain HTTP — no pairing, no auth, no TLS/certificate issues like the Samsung/LG drivers hit.
 * Sourced directly from Roku's own developer documentation (ADR-HEARTH-007), not community
 * reverse-engineering.
 */
export class RokuEcpDriver implements DeviceDriver {
  id = ROKU_ECP_DRIVER_ID;
  displayName = "Roku (ECP)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // See SonyBraviaDriver.ts's identical comment — a scheduled reconnect's connect() can still be
  // in flight when disconnect() runs; bumped only there, checked before any state write.
  private generations = new Map<string, number>();
  // Same dedupe as LgWebOsDriver.ts/SonyBraviaDriver.ts, applied for consistency.
  private inFlightConnects = new Map<string, Promise<void>>();

  getCapabilities(): CapabilityId[] {
    return ROKU_CAPABILITIES;
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
      const client = new RokuEcpClient(requireConfig(device));
      const info = await client.getDeviceInfo();
      if (generation !== (this.generations.get(device.id) ?? 0)) return; // disconnected while this was in flight
      this.setState(device.id, {
        connection: "connected",
        values: { power: info.powerMode === "PowerOn" ? "on" : "off", model: info.modelName },
        lastUpdated: Date.now(),
      });
      // Real playback state as of right now, the moment the remote screen connects — not a
      // guess based on whether a streaming app was launched. See refreshPlaybackState's own
      // comment for why this isn't kept continuously live via polling.
      await this.refreshPlaybackState(device, client);
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
    const client = new RokuEcpClient(requireConfig(device));
    try {
      await this.applyCommand(client, device, command);
    } catch (err) {
      if (err instanceof RokuValidationError) throw err; // a bad arg, not a dead device — don't touch connection state
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
      this.scheduleReconnect(device);
      throw err;
    }
    const state = this.states.get(device.id) ?? { connection: "connected", values: {}, lastUpdated: Date.now() };
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

  private async applyCommand(client: RokuEcpClient, device: Device, command: Command): Promise<void> {
    switch (command.capability) {
      case "powerOff":
        await client.keypress("PowerOff");
        await this.refreshPowerState(device, client, "off");
        return;
      case "volumeUp":
        await client.keypress("VolumeUp");
        this.patchValues(device.id, { lastAction: "volumeUp" });
        return;
      case "volumeDown":
        await client.keypress("VolumeDown");
        this.patchValues(device.id, { lastAction: "volumeDown" });
        return;
      case "mute":
        await client.keypress("VolumeMute");
        this.patchValues(device.id, { muted: !this.states.get(device.id)?.values.muted });
        return;
      case "channelUp":
        await client.keypress("ChannelUp");
        this.patchValues(device.id, { lastAction: "channelUp" });
        return;
      case "channelDown":
        await client.keypress("ChannelDown");
        this.patchValues(device.id, { lastAction: "channelDown" });
        return;
      case "select":
        await client.keypress("Select");
        this.patchValues(device.id, { lastAction: "select" });
        return;
      case "back":
        await client.keypress("Back");
        this.patchValues(device.id, { lastAction: "back" });
        return;
      case "home":
        await client.keypress("Home");
        this.patchValues(device.id, { lastAction: "home" });
        return;
      case "directionalNavigation": {
        const direction = command.args?.direction as NavigationDirection | undefined;
        if (!direction || !(direction in DIRECTION_KEYS)) {
          throw new RokuValidationError("directionalNavigation requires a valid 'direction' arg");
        }
        await client.keypress(DIRECTION_KEYS[direction]);
        this.patchValues(device.id, { lastNavigation: direction });
        return;
      }
      case "setChannel": {
        const channel = command.args?.channel;
        if (typeof channel !== "number") throw new RokuValidationError("setChannel requires a numeric 'channel' arg");
        // "Lit_<char>" sends a literal printable character — sourced from Roku's own official
        // ECP docs, not a community guess. Digits go through the same literal-keypress path.
        await sendDigitSequence(channel, (digit) => client.keypress(`Lit_${digit}`));
        this.patchValues(device.id, { channel });
        return;
      }
      case "inputSelection": {
        const input = command.args?.input;
        if (typeof input !== "string") throw new RokuValidationError("inputSelection requires a string 'input' arg");
        await client.keypress(inputKeyFor(input));
        this.patchValues(device.id, { input });
        return;
      }
      case "launchApp": {
        const service = command.args?.service as StreamingService | undefined;
        const channelId = service ? ROKU_CHANNEL_IDS[service] : undefined;
        if (!channelId) throw new RokuValidationError(`launchApp requires a supported 'service' arg (got ${String(service)})`);
        await client.launchChannel(channelId);
        this.patchValues(device.id, { lastAction: `launch:${service}` });
        return;
      }
      case "playPause":
        // Roku's own "Play" key IS the toggle (see Capability.ts's citation) — there is no
        // separate Pause key to choose between, unlike LG.
        await client.keypress("Play");
        await this.refreshPlaybackState(device, client);
        return;
      default:
        throw new Error(`RokuEcpDriver does not implement capability: ${command.capability}`);
    }
  }

  private async refreshPowerState(device: Device, client: RokuEcpClient, fallback: "on" | "off"): Promise<void> {
    try {
      const info = await client.getDeviceInfo();
      this.patchValues(device.id, { power: info.powerMode === "PowerOn" ? "on" : "off" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not read back power state for ${device.name} after command; assuming ${fallback}`, { message });
      this.patchValues(device.id, { power: fallback });
    }
  }

  /** Re-reads real playback state after a playPause press. Best-effort: a failed read-back just
   * leaves the last-known value in place rather than failing the whole command — same treatment
   * refreshPowerState already gives power state after powerOff. No periodic/background polling
   * exists for this (or any other) field on this driver — playbackState is refreshed only at
   * connect() and after a playPause press, deliberately matching every other Roku field's
   * existing update cadence rather than introducing a new polling mechanism (see ADR-HEARTH-051). */
  private async refreshPlaybackState(device: Device, client: RokuEcpClient): Promise<void> {
    try {
      const info = await client.getMediaPlayerState();
      this.patchValues(device.id, { playbackState: normalizePlaybackState(info.state) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(LOG_SCOPE, `Could not read back playback state for ${device.name}`, { message });
    }
  }

  private patchValues(deviceId: string, patch: DeviceState["values"]): void {
    const current = this.states.get(deviceId);
    this.setState(deviceId, {
      connection: "connected",
      values: { ...current?.values, ...patch },
      lastUpdated: Date.now(),
    });
  }

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
