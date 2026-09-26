import { FccNotConfiguredError, FccTokenRejectedError, FccUnreachableError } from "./fccErrors";

// ADR-HEARTH-142: a phone behind iCloud Private Relay, Limit IP Address Tracking, a missing Local
// Network permission or the wrong Wi-Fi fails every home-network request with the same opaque
// message. This turns a caught error into a plain "what to check" answer instead of silence.

export type NetworkFailureKind = "lan-blocked" | "rejected-token" | "not-configured" | "unknown";

export interface NetworkFailureDiagnosis {
  kind: NetworkFailureKind;
  /** Full plain-language explanation. */
  message: string;
  /** One short sentence for tight spaces (the remote's reconnect card). */
  summary: string;
  /** Ordered things to check, most likely first. Empty when nothing actionable is known. */
  fixes: string[];
}

const LAN_BLOCKED_FIXES = [
  "Turn off iCloud Private Relay (Settings > Apple ID > iCloud > Private Relay).",
  'Turn off "Limit IP Address Tracking" and "Private Wi-Fi Address" for your home Wi-Fi (Settings > Wi-Fi > the (i) next to it).',
  "Make sure Hearth is On under Settings > Privacy & Security > Local Network.",
  "Make sure this phone is on the home Wi-Fi, not a guest or kids network.",
];

const REJECTED_TOKEN_FIXES = ["Open Family Command Center settings in Hearth and re-enter the token, or scan its QR code again."];
const NOT_CONFIGURED_FIXES = ["Open Family Command Center settings in Hearth and add its address and token."];

const LAN_BLOCKED_PATTERN =
  /network request failed|no route to host|host is unreachable|network is unreachable|ehostunreach|enetunreach|error 65|didn't respond within|could not reach .* directly|connection refused|econnrefused/i;
const TIMEOUT_PATTERN = /timed? ?out|timeout|aborted/i;
const PRIVATE_ADDRESS_PATTERN = /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/;
const REJECTED_TOKEN_PATTERN = /rejected the saved token|token was rejected|token.*rejected|rejected.*token/i;
const NOT_CONFIGURED_PATTERN = /isn't (connected|configured)|set up the lan address/i;
const ABORT_ERROR_NAME = "AbortError";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : String(error ?? "");
}

function isLanBlockedMessage(error: unknown, message: string): boolean {
  if (error instanceof Error && error.name === ABORT_ERROR_NAME) return true;
  if (LAN_BLOCKED_PATTERN.test(message)) return true;
  return TIMEOUT_PATTERN.test(message) && PRIVATE_ADDRESS_PATTERN.test(message);
}

function lanBlocked(): NetworkFailureDiagnosis {
  return {
    kind: "lan-blocked",
    message: "Hearth can't reach your home network or Family Command Center from this phone.",
    summary: "Can't reach your home network — check iCloud Private Relay, Limit IP Address Tracking and Local Network access for Hearth.",
    fixes: LAN_BLOCKED_FIXES,
  };
}

function rejectedToken(): NetworkFailureDiagnosis {
  return {
    kind: "rejected-token",
    message: "Family Command Center is reachable but rejected this phone's saved token.",
    summary: "Family Command Center rejected the saved token — re-enter it in settings.",
    fixes: REJECTED_TOKEN_FIXES,
  };
}

function notConfigured(): NetworkFailureDiagnosis {
  return {
    kind: "not-configured",
    message: "Family Command Center isn't set up on this phone yet.",
    summary: "Family Command Center isn't set up yet — add it in settings.",
    fixes: NOT_CONFIGURED_FIXES,
  };
}

/** Turns a caught error or message into a plain-language diagnosis with ordered fixes, preferring error class over message text. */
export function classifyNetworkFailure(error: unknown): NetworkFailureDiagnosis {
  if (error instanceof FccNotConfiguredError) return notConfigured();
  if (error instanceof FccTokenRejectedError) return rejectedToken();
  if (error instanceof FccUnreachableError) return lanBlocked();

  const message = messageOf(error);
  if (NOT_CONFIGURED_PATTERN.test(message)) return notConfigured();
  if (REJECTED_TOKEN_PATTERN.test(message)) return rejectedToken();
  if (isLanBlockedMessage(error, message)) return lanBlocked();
  return { kind: "unknown", message, summary: message, fixes: [] };
}
