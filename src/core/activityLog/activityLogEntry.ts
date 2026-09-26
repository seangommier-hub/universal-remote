import { CommandError } from "../types/Command";

// ADR-HEARTH-170: one line of the household activity log. The wire shape is shared with Family
// Command Center (adr/0199), whose schema is strict: adding a field here means adding it there first.

/** One command a person sent from a phone, and whether it worked. */
export interface ActivityLogEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  /** Plain-language phrase such as "turned off"; never contains typed text, PINs or addresses. */
  verb: string;
  ok: boolean;
  /** Short plain reason, present only when `ok` is false. */
  error?: string;
  /** When the command finished, ISO 8601. */
  at: string;
  /** The phone owner's display name. */
  who: string;
}

export const MAX_DEVICE_NAME_LENGTH = 100;
export const MAX_WHO_LENGTH = 60;
export const MAX_VERB_LENGTH = 80;
export const MAX_ERROR_LENGTH = 100;
export const MAX_DEVICE_ID_LENGTH = 128;

const ERROR_PHRASES: Record<CommandError["code"], string> = {
  device_not_found: "device not found",
  driver_not_found: "no driver for this device",
  unsupported_capability: "not supported by this device",
  driver_error: "it didn't respond",
};

/** Turns a command error code into a short fixed phrase; the raw driver message is deliberately dropped. */
export function describeCommandError(code: CommandError["code"]): string {
  return ERROR_PHRASES[code];
}

/** Trims a display string to a limit, or returns the fallback when nothing is left. */
export function clampText(value: string, limit: number, fallback: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, limit).trim();
  return trimmed || fallback;
}
