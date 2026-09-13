import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

// Real-hardware research (2026-09-13): Xbox's SmartGlass protocol has a genuine, documented,
// UNAUTHENTICATED power-on mechanism -- a UDP broadcast packet, reverse-engineered from the
// OpenXbox project's own xbox-smartglass-core-python reference implementation (packet layout
// confirmed byte-for-byte against xbox/sg/packet/simple.py, xbox/sg/enum.py, xbox/sg/protocol.py --
// see family-command-center's xbox-client.ts for the exact spec and citations). Power-off and
// media control need a full encrypted SmartGlass session -- an RSA/ECDH handshake plus a Microsoft
// account OAuth token -- a materially bigger integration, out of scope here. Only "powerOn" is
// declared, matching this codebase's own strict rule (see Capability.ts): a driver never claims a
// capability it can't actually perform.
//
// The UDP send itself can't happen from the phone -- Expo Go has no raw socket module -- so this
// goes through Family Command Center the same way LG's SSAP WebSocket already does for a different
// reason (TLS trust there; here, plain platform capability). Every device using this driver needs
// `device.config = { liveId, ipAddress? }`; `liveId` is the console's own "Xbox Live device ID",
// found in Settings → System → Console info on the Xbox itself (see AddXboxDeviceScreen.tsx's
// setup guide).

const XBOX_CAPABILITIES: CapabilityId[] = ["powerOn"];

export const XBOX_DRIVER_ID = "xbox-smartglass";

interface XboxConfig {
  liveId: string;
  ipAddress?: string;
}

function requireConfig(device: Device): XboxConfig {
  const liveId = device.config?.liveId;
  if (typeof liveId !== "string" || liveId.length === 0) {
    throw new Error(`Device ${device.id} is missing Xbox config (config.liveId) — pair it first`);
  }
  const ipAddress = typeof device.config?.ipAddress === "string" ? device.config.ipAddress : undefined;
  return { liveId, ipAddress };
}

/**
 * Driver for Xbox consoles' power-on-only SmartGlass capability, relayed through Family Command
 * Center (see xbox-client.ts there). Unlike every other driver in this codebase, there is
 * genuinely no way to know whether a console is on, off, or even present on the network without
 * either the full authenticated session or the console already being on and responding to
 * discovery — so this driver never claims to know power state, and `connect()` does no network
 * probe at all: sending a real power-on-style packet just to "test" adding the device would be an
 * unwanted side effect (waking someone's console when they only meant to add it to Hearth), and
 * there's no side-effect-free way to confirm an *off* console is reachable. The liveId is trusted
 * as given, read directly off the console's own settings screen by the user — the same
 * "pre-registered by MAC before it's ever seen live" pattern Family Command Center's own
 * known-device.ts already documents for devices added before they first connect.
 */
export class XboxDriver implements DeviceDriver {
  id = XBOX_DRIVER_ID;
  displayName = "Xbox (SmartGlass power-on)";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return XBOX_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    requireConfig(device); // throws if genuinely unconfigured — otherwise nothing to verify, see class doc
    this.setState(device.id, { connection: "connected", values: {}, lastUpdated: Date.now() });
  }

  async disconnect(device: Device): Promise<void> {
    this.setState(device.id, { connection: "disconnected", values: {}, lastUpdated: Date.now() });
  }

  async getState(device: Device): Promise<DeviceState> {
    return this.states.get(device.id) ?? { connection: "unknown", values: {}, lastUpdated: Date.now() };
  }

  async executeCommand(device: Device, command: Command): Promise<CommandResult> {
    if (command.capability !== "powerOn") {
      throw new Error(`XboxDriver does not implement capability: ${command.capability}`);
    }
    const { liveId, ipAddress } = requireConfig(device);
    const config = await loadFamilyCommandCenterConfig();
    if (!config) {
      throw new Error("Family Command Center isn't connected — add its address and token in Settings first.");
    }

    const response = await fetch(`${config.baseUrl}/api/integrations/hearth/xbox/poweron`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ liveId, ipAddress }),
    });
    if (!response.ok) {
      throw new Error(response.status === 401 ? "Family Command Center rejected the saved token." : `Family Command Center returned ${response.status}.`);
    }

    // No acknowledgment exists in this protocol (see class doc) — "the packet was sent" is the
    // most honest claim available, never "the console turned on."
    const state: DeviceState = { connection: "connected", values: { lastAction: "powerOn" }, lastUpdated: Date.now() };
    this.setState(device.id, state);
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

  private setState(deviceId: string, state: DeviceState): void {
    this.states.set(deviceId, state);
    this.listeners.get(deviceId)?.forEach((listener) => listener(deviceId, state));
  }
}
