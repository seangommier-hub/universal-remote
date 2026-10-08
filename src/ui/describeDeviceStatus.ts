import type { ConnectionState } from "../core/types/DeviceState";
import type { ConnectivityMode } from "../core/network/fccConnectivity";

/** How stale a connected device's last update must be before the line mentions it. */
export const STALE_CONNECTED_SECONDS = 5 * 60;
/** Longest raw error text quoted in a status line, so the line stays one row. */
export const MAX_ERROR_CHARS = 40;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const UNREACHABLE_PATTERN =
  /network request failed|no route to host|unreachable|ehostunreach|enetunreach|econnrefused|refused|timed? ?out|timeout|aborted|didn't respond|could not reach/i;
const ELLIPSIS = "…";

export interface DeviceStatusInput {
  connection: ConnectionState;
  /** Only known when the device reports power; undefined otherwise. */
  knownPower?: "on" | "off";
  /** True while a Wake-on-LAN fast-retry burst is running for this device. */
  wakeBurstActive: boolean;
  /** The last connection error text, when there is one. */
  lastError?: string;
  connectivityMode: ConnectivityMode;
  /** Whether Family Command Center (the relay) answered recently; undefined when not known. */
  fccReachable?: boolean;
  /** Seconds since this device last reported in; undefined when never seen. */
  secondsSinceLastSeen?: number;
  /** True when the device's driver has flagged its saved pairing as refused (ADR-HEARTH-223). */
  needsRePair?: boolean;
}

export const NEEDS_RE_PAIR_STATUS = "Needs re-pairing — open it to fix";

function formatAge(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return "just now";
  if (seconds < SECONDS_PER_HOUR) return `${Math.floor(seconds / SECONDS_PER_MINUTE)} min ago`;
  if (seconds < SECONDS_PER_DAY) return `${Math.floor(seconds / SECONDS_PER_HOUR)} h ago`;
  return `${Math.floor(seconds / SECONDS_PER_DAY)} d ago`;
}

function seenSuffix(seconds: number | undefined): string {
  return seconds === undefined ? "" : ` (last seen ${formatAge(seconds)})`;
}

function shortError(error: string): string {
  const oneLine = error.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_ERROR_CHARS ? `${oneLine.slice(0, MAX_ERROR_CHARS - 1)}${ELLIPSIS}` : oneLine;
}

function describeConnected(input: DeviceStatusInput): string {
  const seconds = input.secondsSinceLastSeen;
  return seconds !== undefined && seconds >= STALE_CONNECTED_SECONDS ? `Connected, last update ${formatAge(seconds)}` : "Connected";
}

function describeAway(input: DeviceStatusInput): string | undefined {
  if (input.connectivityMode !== "away") return undefined;
  if (input.fccReachable === false) return "Away, and the relay isn't answering — retrying";
  return "Reachable through the relay only — retrying";
}

function describeNotConnected(input: DeviceStatusInput): string {
  if (input.wakeBurstActive) return "Waking up (this can take a minute)";
  const away = describeAway(input);
  if (away) return away;
  if (input.needsRePair) return NEEDS_RE_PAIR_STATUS;
  if (input.lastError && UNREACHABLE_PATTERN.test(input.lastError)) {
    return "Can't reach it — plugged in and on Wi-Fi? Retrying";
  }
  if (input.lastError) return `Last try failed: ${shortError(input.lastError)} — retrying`;
  if (input.connection === "unknown") return "Connecting… retrying until it answers";
  return `Not connected — retrying automatically${seenSuffix(input.secondsSinceLastSeen)}`;
}

/** One short plain-language line for a device's status; always says what Hearth does next when not connected (ADR-HEARTH-163). */
export function describeDeviceStatus(input: DeviceStatusInput): string {
  return input.connection === "connected" ? describeConnected(input) : describeNotConnected(input);
}
