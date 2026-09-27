import { CapabilityId } from "../types/Capability";
import { Device } from "../types/Device";

// ADR-HEARTH-178: presses that open the house to the outside (a lock, a garage door, a gate, a door) ask "are you sure?" first.
const LOCK_CAPABILITIES: ReadonlySet<CapabilityId> = new Set<CapabilityId>(["lock", "unlock"]);
const COVER_MOVES: ReadonlySet<CapabilityId> = new Set<CapabilityId>(["open", "close", "setPosition"]);
const SECURITY_COVER_CLASSES: ReadonlySet<string> = new Set(["garage", "gate", "door"]);
// ADR-HEARTH-182: arming or disarming the alarm always asks, after any code pad the panel itself requires.
const ALARM_CAPABILITIES: ReadonlySet<CapabilityId> = new Set<CapabilityId>(["armHome", "armAway", "armNight", "disarm"]);

export interface ConfirmationPrompt {
  title: string;
  message: string;
  confirmLabel: string;
}

const VERB_BY_CAPABILITY: Partial<Record<CapabilityId, string>> = {
  lock: "Lock",
  unlock: "Unlock",
  open: "Open",
  close: "Close",
  setPosition: "Move",
  armHome: "Arm Home",
  armAway: "Arm Away",
  armNight: "Arm Night",
  disarm: "Disarm",
};

const ACCESS_MESSAGE = "This changes who can get into the house.";
const ALARM_MESSAGE = "This changes your home's security system.";

/** The device class recorded on the device or reported by its live state (a device added before classes were stored still has the live one). */
export function deviceClassOf(device: Device, values: Record<string, unknown>): string | undefined {
  const live = values.deviceClass;
  if (typeof live === "string") return live;
  const saved = device.config?.deviceClass;
  return typeof saved === "string" ? saved : undefined;
}

/** True when a press of this capability on this device needs a confirmation before it is sent. */
export function needsConfirmation(device: Device, capability: CapabilityId, values: Record<string, unknown>): boolean {
  if (LOCK_CAPABILITIES.has(capability) || ALARM_CAPABILITIES.has(capability)) return true;
  if (!COVER_MOVES.has(capability)) return false;
  const deviceClass = deviceClassOf(device, values);
  return deviceClass !== undefined && SECURITY_COVER_CLASSES.has(deviceClass);
}

/** The wording of the confirmation for a press, or null when none is needed. */
export function confirmationFor(device: Device, capability: CapabilityId, values: Record<string, unknown>): ConfirmationPrompt | null {
  if (!needsConfirmation(device, capability, values)) return null;
  const verb = VERB_BY_CAPABILITY[capability] ?? "Send";
  const message = ALARM_CAPABILITIES.has(capability) ? ALARM_MESSAGE : ACCESS_MESSAGE;
  return { title: `${verb} ${device.name}?`, message: `${message} Tap ${verb} to go ahead.`, confirmLabel: verb };
}
