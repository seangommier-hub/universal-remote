import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId, NavigationDirection, StreamingService } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { AppleTvClient } from "./AppleTvClient";

export const APPLE_TV_DRIVER_ID = "appletv-atvremote";

// Verified directly against pyatv's own `atvremote commands` output (2026-09-20), not assumed:
// turn_on/turn_off/power_state, up/down/left/right/select/home, volume_up/volume_down/set_volume,
// play_pause, channel_up/channel_down, launch_app, and text_append are all real, documented
// commands. "menu" (Apple's own remote UX: the physical Menu button is Back/Cancel, with no
// separate dedicated Back button) maps to Hearth's `back` capability, not a separate `menu`
// capability — there's no second, distinct "open a settings/quick menu" button on an Apple TV
// remote the way LG/Samsung have. `mute`, `setChannel` (digit entry), `inputSelection`, and
// `sleepTimer`/`settings`/`openSourceList` are all deliberately NOT declared: no corresponding
// atvremote command exists for any of them — Apple TV has no channel numbers, no HDMI inputs of
// its own to switch between, and no documented mute toggle distinct from setting volume to 0.
const APPLE_TV_CAPABILITIES: CapabilityId[] = [
  "power",
  "volumeUp",
  "volumeDown",
  "setVolume",
  "directionalNavigation",
  "select",
  "home",
  "back",
  "playPause",
  "channelUp",
  "channelDown",
  "launchApp",
  "textEntry",
];

const DIRECTION_COMMANDS: Record<NavigationDirection, string> = {
  up: "up",
  down: "down",
  left: "left",
  right: "right",
};

// Real app bundle IDs — corroborated across multiple independent community sources (tvOS
// Shortcuts automations, HomeKit/Apple TV community threads), but Apple publishes no official
// bundle-id registry the way LG's Connect SDK documents its app ids — same "flagged as
// community-corroborated, not primary-source-confirmed" treatment LgWebOsDriver.ts already gives
// its own less-certain entries (amazon/hulu).
const APP_BUNDLE_IDS: Record<StreamingService, string> = {
  netflix: "com.netflix.Netflix",
  hulu: "com.hulu.plus",
  primeVideo: "com.amazon.aiv.AIVApp",
  youtube: "com.google.ios.youtube",
};

interface AppleTvConfig {
  ipAddress: string;
}

function requireConfig(device: Device): AppleTvConfig {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string") {
    throw new Error(`Device ${device.id} is missing Apple TV config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

/** Parses atvremote's real `power_state` output ("PowerState.On"/"PowerState.Off"/"PowerState.Unknown", verified directly against pyatv.const.PowerState's own __str__). */
function parsePowerState(raw: string): "on" | "off" | undefined {
  if (raw.includes("PowerState.On")) return "on";
  if (raw.includes("PowerState.Off")) return "off";
  return undefined;
}

/**
 * Driver for Apple TV (tvOS), relayed through Family Command Center (AppleTvClient.ts). Like Sony
 * BRAVIA, there's no persistent connection to hold open — every command is a fresh `atvremote`
 * subprocess on Family Command Center's side, so connect()/executeCommand always re-read real
 * state from the device rather than assuming. MRP-only pairing for this first version; pairing
 * the newer Companion protocol too (pyatv's own recommendation for more reliable power control)
 * is a disclosed future enhancement, not built here.
 */
export class AppleTvDriver implements DeviceDriver {
  id = APPLE_TV_DRIVER_ID;
  displayName = "Apple TV (via Family Command Center)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return APPLE_TV_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const { ipAddress } = requireConfig(device);
    try {
      const raw = await new AppleTvClient().sendCommand(ipAddress, "power_state");
      this.setState(device.id, { connection: "connected", values: { power: parsePowerState(raw) }, lastUpdated: Date.now() });
    } catch (err) {
      this.setState(device.id, { connection: "disconnected", values: {}, lastUpdated: Date.now() });
      throw err;
    }
  }

  async disconnect(device: Device): Promise<void> {
    const current = this.states.get(device.id);
    this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    const { ipAddress } = requireConfig(device);
    const client = new AppleTvClient();
    const values = await this.applyCommand(client, ipAddress, device.id, command);
    const state: DeviceState = { connection: "connected", values, lastUpdated: Date.now() };
    this.setState(device.id, state);
    return {
      success: true,
      deviceId: device.id,
      capability: command.capability,
      timestamp: Date.now(),
      state: state.values,
    };
  }

  private async applyCommand(client: AppleTvClient, ipAddress: string, deviceId: string, command: Command): Promise<DeviceState["values"]> {
    const current = this.states.get(deviceId)?.values ?? {};
    switch (command.capability) {
      case "power": {
        // Real toggle, same "read current state, send the opposite" shape as SonyBraviaDriver's
        // own "power" case — atvremote has separate turn_on/turn_off, not a single toggle call.
        const raw = await client.sendCommand(ipAddress, "power_state");
        const isOn = parsePowerState(raw) === "on";
        await client.sendCommand(ipAddress, isOn ? "turn_off" : "turn_on");
        return { ...current, power: isOn ? "off" : "on" };
      }
      case "volumeUp":
        await client.sendCommand(ipAddress, "volume_up");
        return { ...current, lastAction: "volumeUp" };
      case "volumeDown":
        await client.sendCommand(ipAddress, "volume_down");
        return { ...current, lastAction: "volumeDown" };
      case "setVolume": {
        const target = command.args?.volume;
        if (typeof target !== "number") throw new Error("setVolume requires a numeric 'volume' arg");
        await client.sendCommand(ipAddress, "set_volume", [String(target)]);
        return { ...current, volume: target };
      }
      case "directionalNavigation": {
        const direction = command.args?.direction as NavigationDirection | undefined;
        if (!direction || !(direction in DIRECTION_COMMANDS)) {
          throw new Error("directionalNavigation requires a valid 'direction' arg");
        }
        await client.sendCommand(ipAddress, DIRECTION_COMMANDS[direction]);
        return { ...current, lastNavigation: direction };
      }
      case "select":
        await client.sendCommand(ipAddress, "select");
        return { ...current, lastAction: "select" };
      case "home":
        await client.sendCommand(ipAddress, "home");
        return { ...current, lastAction: "home" };
      case "back":
        // Apple's own remote UX: the physical Menu button is Back/Cancel — no separate button.
        await client.sendCommand(ipAddress, "menu");
        return { ...current, lastAction: "back" };
      case "playPause":
        await client.sendCommand(ipAddress, "play_pause");
        return { ...current, lastAction: "playPause" };
      case "channelUp":
        await client.sendCommand(ipAddress, "channel_up");
        return { ...current, lastAction: "channelUp" };
      case "channelDown":
        await client.sendCommand(ipAddress, "channel_down");
        return { ...current, lastAction: "channelDown" };
      case "launchApp": {
        const service = command.args?.service as StreamingService | undefined;
        const directBundleId = command.args?.appId as string | undefined;
        const resolvedBundleId = directBundleId ?? (service ? APP_BUNDLE_IDS[service] : undefined);
        if (!resolvedBundleId) throw new Error(`launchApp requires a supported 'service' or 'appId' arg (got service=${String(service)}, appId=${String(directBundleId)})`);
        await client.sendCommand(ipAddress, "launch_app", [resolvedBundleId]);
        return { ...current, lastAction: `launch:${directBundleId ?? service}`, lastLaunchedAppId: resolvedBundleId };
      }
      case "textEntry": {
        const text = command.args?.text;
        if (typeof text !== "string" || text.length === 0) {
          throw new Error("textEntry requires a non-empty string 'text' arg");
        }
        await client.sendCommand(ipAddress, "text_append", [text]);
        return { ...current, lastAction: "textEntry" };
      }
      default:
        throw new Error(`AppleTvDriver does not implement capability: ${command.capability}`);
    }
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
