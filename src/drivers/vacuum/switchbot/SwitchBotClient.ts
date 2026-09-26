// Thin client for SwitchBot's official cloud OpenAPI v1.1 (github.com/OpenWonderLabs/SwitchBotAPI)
// — a plain internet-reachable HTTPS REST API, not a local-network device like every other driver
// in this project. No relay/pairing dance needed (unlike Hue/LG/Samsung's LAN-only protocols):
// this is called directly from the phone over the internet, the same way Roku's ECP is called
// directly over LAN, just without the LAN requirement. See ADR-HEARTH-118.
//
// Auth is a static, per-user Open Token + Secret pair the user generates themselves in the
// SwitchBot app (Profile > Preferences > About > tap App Version 10x > Developer Options > Get
// Token) — never their SwitchBot account password. Every request is HMAC-SHA256 signed
// (token + 13-digit-ms-timestamp + nonce, keyed by secret, base64, uppercased) — sourced directly
// from the official README, not guessed. HMAC/SHA-256 itself comes from @noble/hashes (audited,
// zero-dependency, actively maintained) rather than a hand-rolled implementation — this project's
// own standing rule against rolling your own cryptography.

import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import * as Crypto from "expo-crypto";
import { fetchWithTimeout } from "../../../core/network/fetchWithTimeout";

const BASE_URL = "https://api.switch-bot.com/v1.1";
// ADR-HEARTH-171: every SwitchBot cloud call is bounded so a black-holed request rejects instead of hanging.
const SWITCHBOT_REQUEST_TIMEOUT_MS = 10_000;

export interface SwitchBotConfig {
  token: string;
  secret: string;
}

export interface SwitchBotDeviceSummary {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  hubDeviceId?: string;
}

export interface SwitchBotVacuumStatus {
  deviceId: string;
  deviceType: string;
  workingStatus: string;
  onlineStatus: string;
  battery: number;
}

interface SwitchBotEnvelope<T> {
  statusCode: number;
  message: string;
  body: T;
}

// Standard RFC 4648 base64 — a plain encoding, not a cryptographic operation, so hand-writing it
// doesn't fall under "don't roll your own crypto." Written locally rather than relying on a
// React Native global (`btoa` expects a binary string, not UTF-8 bytes, and is a common source of
// subtle mis-encoding) or pulling in another dependency for one small, easily-verified function.
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 !== undefined ? b1 >> 4 : 0)];
    result += b1 !== undefined ? BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 !== undefined ? b2 >> 6 : 0)] : "=";
    result += b2 !== undefined ? BASE64_CHARS[b2 & 0x3f] : "=";
  }
  return result;
}

function buildAuthHeaders(config: SwitchBotConfig): Record<string, string> {
  const t = Date.now().toString();
  const nonce = Crypto.randomUUID();
  const data = config.token + t + nonce;
  const signatureBytes = hmac(sha256, new TextEncoder().encode(config.secret), new TextEncoder().encode(data));
  return {
    Authorization: config.token,
    sign: bytesToBase64(signatureBytes).toUpperCase(),
    t,
    nonce,
    "Content-Type": "application/json; charset=utf8",
  };
}

async function parseEnvelope<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) throw new Error(`SwitchBot API returned HTTP ${response.status} ${action}`);
  const envelope = (await response.json()) as SwitchBotEnvelope<T>;
  // 100 is the documented success code; anything else (e.g. 190 invalid token, 191 exceeded
  // request limit) is a real API-level error even though the HTTP status itself was 200.
  if (envelope.statusCode !== 100) throw new Error(`SwitchBot API error ${action}: ${envelope.message} (code ${envelope.statusCode})`);
  return envelope.body;
}

export class SwitchBotClient {
  constructor(private config: SwitchBotConfig) {}

  async listDevices(): Promise<SwitchBotDeviceSummary[]> {
    const response = await fetchWithTimeout(`${BASE_URL}/devices`, { method: "GET", headers: buildAuthHeaders(this.config) }, SWITCHBOT_REQUEST_TIMEOUT_MS);
    const body = await parseEnvelope<{ deviceList: SwitchBotDeviceSummary[] }>(response, "listing devices");
    return body.deviceList;
  }

  async getStatus(deviceId: string): Promise<SwitchBotVacuumStatus> {
    const response = await fetchWithTimeout(`${BASE_URL}/devices/${deviceId}/status`, { method: "GET", headers: buildAuthHeaders(this.config) }, SWITCHBOT_REQUEST_TIMEOUT_MS);
    return parseEnvelope<SwitchBotVacuumStatus>(response, `reading device ${deviceId}`);
  }

  async sendCommand(deviceId: string, command: string, parameter: string | number = "default"): Promise<void> {
    const response = await fetchWithTimeout(`${BASE_URL}/devices/${deviceId}/commands`, {
      method: "POST",
      headers: buildAuthHeaders(this.config),
      body: JSON.stringify({ commandType: "command", command, parameter }),
    }, SWITCHBOT_REQUEST_TIMEOUT_MS);
    await parseEnvelope<unknown>(response, `sending ${command} to ${deviceId}`);
  }
}
