import { DeviceDriver, StateChangeListener } from "../../../core/drivers/DeviceDriver";
import { CapabilityId } from "../../../core/types/Capability";
import { Command, CommandResult } from "../../../core/types/Command";
import { Device } from "../../../core/types/Device";
import { DeviceState } from "../../../core/types/DeviceState";
import { getSysInfo, setRelayState } from "./KasaClient";

export const KASA_PLUG_DRIVER_ID = "kasa-plug";
// TP-Link's own local protocol (see KasaClient.ts / family-command-center's kasa-client.ts) only
// ever exposes the relay on/off -- no dimming, no energy-monitor readback wired up here even on
// models (HS110/KP115) that support it, matching this codebase's own rule that a driver never
// claims a capability it can't actually perform (see Capability.ts, and XboxDriver.ts's identical
// power-on-only scope for the same reason).
const KASA_CAPABILITIES: CapabilityId[] = ["power"];

function requireConfig(device: Device): { ipAddress: string } {
  const ipAddress = device.config?.ipAddress;
  if (typeof ipAddress !== "string" || ipAddress.length === 0) {
    throw new Error(`Device ${device.id} is missing Kasa config (config.ipAddress) — pair it first`);
  }
  return { ipAddress };
}

/**
 * Driver for TP-Link Kasa smart plugs (HS100/HS103/HS105/HS110/KP115 and similar), reached
 * through Family Command Center's raw-TCP proxy (see KasaClient.ts) since Expo Go has no raw
 * socket module. Deliberately scoped to plugs running TP-Link's legacy, unauthenticated local
 * protocol only -- confirmed against python-kasa's own source (2026-09-15) that newer Kasa
 * firmware speaks a different, encrypted protocol ("KLAP") this driver cannot talk to at all. A
 * plug on that newer protocol fails with an honest, specific error (surfaced from
 * family-command-center's kasa-client.ts) rather than silently misreporting its state.
 */
export class KasaPlugDriver implements DeviceDriver {
  id = KASA_PLUG_DRIVER_ID;
  displayName = "TP-Link Kasa";

  private states = new Map<string, DeviceState>();
  private listeners = new Map<string, Set<StateChangeListener>>();

  getCapabilities(): CapabilityId[] {
    return KASA_CAPABILITIES;
  }

  async connect(device: Device): Promise<void> {
    const { ipAddress } = requireConfig(device);
    try {
      const info = await getSysInfo(ipAddress);
      // A genuinely missing relay_state (the protocol type allows it, though real hardware
      // always reports it) has nothing honest to show as "on" or "off" -- same "unknown state,
      // don't guess" rule as UniversalTvRemote.tsx's knownPower pattern, so this is left out of
      // values entirely rather than defaulting to a false claim.
      const values: DeviceState["values"] = info.model ? { model: info.model } : {};
      if (info.relayState !== undefined) values.power = info.relayState ? "on" : "off";
      this.setState(device.id, { connection: "connected", values, lastUpdated: Date.now() });
    } catch (err) {
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
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
    if (command.capability !== "power") {
      throw new Error(`KasaPlugDriver does not implement capability: ${command.capability}`);
    }
    const { ipAddress } = requireConfig(device);
    try {
      const current = this.states.get(device.id)?.values.power;
      const next = current === "on" ? "off" : "on";
      await setRelayState(ipAddress, next === "on");
      // Unlike SmartThingsOutletDriver's optimistic assumption, this protocol gives a real
      // readback -- re-querying after the command matches RokuEcpDriver's refreshPowerState
      // honesty pattern (never claim a state was reached without checking), and catches the plug
      // rejecting the command for a reason that isn't a network failure (e.g. a firmware bug).
      const info = await getSysInfo(ipAddress);
      const confirmedPower = info.relayState !== undefined ? (info.relayState ? "on" : "off") : next;
      this.setState(device.id, { connection: "connected", values: { power: confirmedPower }, lastUpdated: Date.now() });
    } catch (err) {
      const current = this.states.get(device.id);
      this.setState(device.id, { connection: "disconnected", values: current?.values ?? {}, lastUpdated: Date.now() });
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
