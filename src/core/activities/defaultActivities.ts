import { CapabilityId } from "../types/Capability";
import { Device } from "../types/Device";
import { Activity, CommandStep } from "../types/Activity";
import { newActivityDraft } from "./activityStepEditing";

/** Name given to the auto-generated "everything on" Activity (ADR-HEARTH-200). */
export const ALL_ON_ACTIVITY_NAME = "All On";
/** Name given to the auto-generated "everything off" Activity (ADR-HEARTH-200). */
export const ALL_OFF_ACTIVITY_NAME = "All Off";

/**
 * Fewest power-capable devices a household needs before the default-activities offer appears
 * (ADR-HEARTH-200). ADR-199's roadmap item 1 specified "2-3"; 2 is used because the offer is a
 * dismissible one-time nudge, not a forced action, so the low end costs nothing to show early.
 */
export const MIN_DEVICES_FOR_DEFAULT_ACTIVITIES = 2;

function normalizedName(name: string): string {
  return name.trim().toLowerCase();
}

/** True when an existing Activity's name already reads as "All On" -- an exact match or one that contains it, so a household's own renamed/qualified copy ("All On (Movie Room)") still counts as already offered. */
export function looksLikeAllOnActivity(name: string): boolean {
  return normalizedName(name).includes(normalizedName(ALL_ON_ACTIVITY_NAME));
}

/** Same check as looksLikeAllOnActivity, for "All Off". */
export function looksLikeAllOffActivity(name: string): boolean {
  return normalizedName(name).includes(normalizedName(ALL_OFF_ACTIVITY_NAME));
}

/** The capability to send to turn a device on: its direction-specific id if it declares one, else the shared toggle, else null when it can't be powered on at all. Mirrors the same capability-by-capability precedence activityChoices.ts's commandChoicesFor already applies. */
export function powerOnCapabilityFor(device: Pick<Device, "capabilities">): CapabilityId | null {
  if (device.capabilities.includes("powerOn")) return "powerOn";
  if (device.capabilities.includes("power")) return "power";
  return null;
}

/** The capability to send to turn a device off, mirroring powerOnCapabilityFor. */
export function powerOffCapabilityFor(device: Pick<Device, "capabilities">): CapabilityId | null {
  if (device.capabilities.includes("powerOff")) return "powerOff";
  if (device.capabilities.includes("power")) return "power";
  return null;
}

/** Devices this household could add to a default power Activity -- anything that declares power, powerOn or powerOff. */
export function powerCapableDevices(devices: Device[]): Device[] {
  return devices.filter((device) => powerOnCapabilityFor(device) !== null || powerOffCapabilityFor(device) !== null);
}

/** Whether to offer generating the default Activities: enough power-capable devices, and neither "All On" nor "All Off" already exists. */
export function shouldOfferDefaultActivities(devices: Device[], existingActivities: Pick<Activity, "name">[]): boolean {
  if (powerCapableDevices(devices).length < MIN_DEVICES_FOR_DEFAULT_ACTIVITIES) return false;
  const hasAllOn = existingActivities.some((activity) => looksLikeAllOnActivity(activity.name));
  const hasAllOff = existingActivities.some((activity) => looksLikeAllOffActivity(activity.name));
  return !hasAllOn && !hasAllOff;
}

function commandStep(deviceId: string, capability: CapabilityId): CommandStep {
  return { kind: "command", deviceId, capability };
}

/** Builds the "All On" draft: one power-on step per capable device, in device-list order (ADR-HEARTH-200 -- no cross-brand receiver/streamer ordering exists elsewhere in this codebase to defer to, so this is the sensible fallback the task called for). Steps leave onFail unset, the same "keep going" default a hand-built step gets from newActivityDraft. */
export function buildAllOnActivity(devices: Device[], id: string, nowIso: string): Activity {
  const steps = devices.reduce<CommandStep[]>((acc, device) => {
    const capability = powerOnCapabilityFor(device);
    if (capability) acc.push(commandStep(device.id, capability));
    return acc;
  }, []);
  return newActivityDraft(id, ALL_ON_ACTIVITY_NAME, steps, nowIso);
}

/** Builds the "All Off" draft: one power-off step per capable device, in the reverse of device-list order -- the last device turned on is the first one turned off, mirroring a real hub's shutdown sequence. */
export function buildAllOffActivity(devices: Device[], id: string, nowIso: string): Activity {
  const steps = [...devices].reverse().reduce<CommandStep[]>((acc, device) => {
    const capability = powerOffCapabilityFor(device);
    if (capability) acc.push(commandStep(device.id, capability));
    return acc;
  }, []);
  return newActivityDraft(id, ALL_OFF_ACTIVITY_NAME, steps, nowIso);
}
