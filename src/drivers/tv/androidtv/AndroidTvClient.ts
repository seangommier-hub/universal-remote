// Thin client for Family Command Center's Android TV Remote v2 bridge (ADR-HEARTH-168, Pi adr/0197).
// The Pi runs python `androidtvremote2` and stores the pairing certificate itself; this client only
// ever sends an IP address, the on-screen pairing code and allowlisted key/app names, and never
// sees a credential.

import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";
import { fccFetch } from "../../../core/network/fccRequest";
import { DEFAULT_FETCH_TIMEOUT_MS, LONG_FETCH_TIMEOUT_MS } from "../../../core/network/fetchWithTimeout";

const ROUTE_BASE = "/api/integrations/hearth/androidtv";
const HTTP_UNAUTHORIZED = 401;
const HTTP_CONFLICT = 409;
/** The Pi's bridge waits up to 20s for the TV, so the request must outlast it. */
const BRIDGE_REQUEST_TIMEOUT_MS = LONG_FETCH_TIMEOUT_MS;
/** A status read or key press: the Pi bridge gives up on an unreachable TV after 8s. */
const COMMAND_REQUEST_TIMEOUT_MS = DEFAULT_FETCH_TIMEOUT_MS * 2;

/** How long confirming the on-screen code may take (the request budget of the finish step). */
export const ANDROID_TV_PAIRING_FINISH_MS = BRIDGE_REQUEST_TIMEOUT_MS;
/** How long the on-screen code stays valid on the Pi before its pairing session expires. */
export const ANDROID_TV_PAIRING_WINDOW_MS = 120000;
export const ANDROID_TV_PAIRING_CODE_PATTERN = /^[0-9A-Fa-f]{6}$/;

/** The Pi's own failure kinds that matter to Hearth; anything else is "bridge_error". */
export type AndroidTvErrorKind = "not_paired" | "unreachable" | "timeout" | "bad_code" | "unknown_session" | "bridge_error";

/** A failure reported by the Pi's Android TV bridge, with its machine-readable kind. */
export class AndroidTvRelayError extends Error {
  constructor(readonly kind: AndroidTvErrorKind, message: string, readonly httpStatus: number) {
    super(message);
    this.name = "AndroidTvRelayError";
  }
}

export interface AndroidTvStatus {
  isOn: boolean | null;
  currentApp: string | null;
}

export interface AndroidTvPairingStart {
  sessionId: string;
  name: string;
  mac: string;
}

export type AndroidTvLaunchTarget = { service: string } | { appId: string };

const KNOWN_KINDS: readonly string[] = ["not_paired", "unreachable", "timeout", "bad_code", "unknown_session"];

function kindOf(value: unknown): AndroidTvErrorKind {
  return typeof value === "string" && KNOWN_KINDS.includes(value) ? (value as AndroidTvErrorKind) : "bridge_error";
}

async function relayRequest<T>(path: string, body: object, timeoutMs: number): Promise<T> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) throw new Error("Family Command Center isn't connected — add its address and token in Settings first.");
  const response = await fccFetch(config, `${ROUTE_BASE}${path}`, { method: "POST", body: JSON.stringify(body) }, timeoutMs);
  if (response.ok) return response.json();
  if (response.status === HTTP_UNAUTHORIZED) throw new Error("Family Command Center rejected the saved token.");
  const payload = (await response.json().catch(() => ({}))) as { error?: string; kind?: string };
  const kind = response.status === HTTP_CONFLICT ? "not_paired" : kindOf(payload.kind);
  throw new AndroidTvRelayError(kind, payload.error ?? `Family Command Center returned ${response.status}.`, response.status);
}

/** Talks to Family Command Center's Android TV Remote v2 relay. */
export class AndroidTvClient {
  /** Makes the TV show a 6-character pairing code; resolves with the session, the TV's name and its MAC. */
  async startPairing(ipAddress: string): Promise<AndroidTvPairingStart> {
    return relayRequest("/pair/start", { ipAddress }, BRIDGE_REQUEST_TIMEOUT_MS);
  }

  /** Submits the code shown on the TV; resolves once the Pi has stored the pairing certificate. */
  async finishPairing(sessionId: string, code: string): Promise<{ name: string; mac: string }> {
    return relayRequest("/pair/finish", { sessionId, code }, BRIDGE_REQUEST_TIMEOUT_MS);
  }

  /** Reads the TV's real power state and foreground app. */
  async getStatus(ipAddress: string): Promise<AndroidTvStatus> {
    return relayRequest("/status", { ipAddress }, COMMAND_REQUEST_TIMEOUT_MS);
  }

  /** Presses one allowlisted key (HOME, DPAD_UP, VOLUME_UP, ...). */
  async sendKey(ipAddress: string, key: string): Promise<void> {
    await relayRequest("/command", { ipAddress, key }, COMMAND_REQUEST_TIMEOUT_MS);
  }

  /** Opens an app by named service or Android package name. */
  async launchApp(ipAddress: string, target: AndroidTvLaunchTarget): Promise<void> {
    await relayRequest("/command", { ipAddress, ...target }, COMMAND_REQUEST_TIMEOUT_MS);
  }

  /** Types text into the TV's focused field. */
  async sendText(ipAddress: string, text: string): Promise<void> {
    await relayRequest("/command", { ipAddress, text }, COMMAND_REQUEST_TIMEOUT_MS);
  }
}
