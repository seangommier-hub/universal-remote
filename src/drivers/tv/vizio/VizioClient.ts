import { fccJsonRequest } from "../../../core/network/fccJsonRequest";

// Vizio SmartCast TVs serve their local API over HTTPS on port 7345 (older sets) or 9000 (newer
// sets) with a self-signed certificate. React Native's fetch cannot be told to accept a
// self-signed certificate, so every call is relayed through Family Command Center (ADR-HEARTH-165),
// which makes the request with certificate checking off. Endpoints, key codes and the pairing
// handshake follow the community pyvizio client (github.com/vkorn/pyvizio); none of it has been
// exercised against a real TV from this project yet.

const VIZIO_RELAY_PATH = "/api/integrations/hearth/vizio/request";
export const VIZIO_PORTS = [7345, 9000];
const PAIRING_DEVICE_NAME = "Hearth";
const PAIRING_DEVICE_ID = "hearth-remote";
const PIN_CHALLENGE_TYPE = 1;
const RESULT_SUCCESS = "SUCCESS";
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;

const POWER_PATH = "/state/device/power_mode";
const VOLUME_PATH = "/menu_native/dynamic/tv_settings/audio/volume";
const MUTE_PATH = "/menu_native/dynamic/tv_settings/audio/mute";
const CURRENT_INPUT_PATH = "/menu_native/dynamic/tv_settings/devices/current_input";
const KEY_COMMAND_PATH = "/key_command/";

/** A remote key as Vizio names it: a code set plus a code within it. */
export interface VizioKey {
  codeset: number;
  code: number;
}

export const VIZIO_KEYS = {
  volumeUp: { codeset: 5, code: 1 },
  volumeDown: { codeset: 5, code: 0 },
  muteToggle: { codeset: 5, code: 4 },
  powerOn: { codeset: 11, code: 1 },
  powerOff: { codeset: 11, code: 0 },
  up: { codeset: 3, code: 8 },
  down: { codeset: 3, code: 0 },
  left: { codeset: 3, code: 1 },
  right: { codeset: 3, code: 7 },
  select: { codeset: 3, code: 2 },
  back: { codeset: 4, code: 0 },
  menu: { codeset: 4, code: 8 },
  home: { codeset: 4, code: 3 },
} satisfies Record<string, VizioKey>;

/** What the client needs to address one TV. */
export interface VizioTarget {
  ipAddress: string;
  port: number;
  authToken?: string;
}

export class VizioApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

interface RelayReply {
  status: number;
  body: string;
}

interface VizioEnvelope {
  STATUS?: { RESULT?: string; DETAIL?: string };
  ITEMS?: { VALUE?: unknown; HASHVAL?: number }[];
  ITEM?: { PAIRING_REQ_TOKEN?: number; AUTH_TOKEN?: string };
}

function parseEnvelope(reply: RelayReply): VizioEnvelope {
  try {
    return JSON.parse(reply.body) as VizioEnvelope;
  } catch {
    if (reply.status < HTTP_OK_MIN || reply.status > HTTP_OK_MAX) throw new VizioApiError(`The Vizio TV answered with HTTP ${reply.status}`, reply.status);
    throw new VizioApiError("The Vizio TV sent a reply Hearth could not read", reply.status);
  }
}

async function vizioRequest(target: VizioTarget, method: "GET" | "PUT", path: string, body?: unknown): Promise<VizioEnvelope> {
  const reply = await fccJsonRequest<RelayReply>(VIZIO_RELAY_PATH, {
    method: "POST",
    body: JSON.stringify({ ip: target.ipAddress, port: target.port, method, path, authToken: target.authToken, body }),
  });
  const envelope = parseEnvelope(reply);
  const result = envelope.STATUS?.RESULT;
  const httpFailed = reply.status < HTTP_OK_MIN || reply.status > HTTP_OK_MAX;
  if (httpFailed || (result !== undefined && result !== RESULT_SUCCESS)) {
    throw new VizioApiError(`The Vizio TV refused the request (${result ?? `HTTP ${reply.status}`})`, reply.status);
  }
  return envelope;
}

/** Starts PIN pairing: the TV shows a PIN on screen and returns the token to pass to finishPairing. */
export async function startPairing(ipAddress: string, port: number): Promise<number> {
  const envelope = await vizioRequest({ ipAddress, port }, "PUT", "/pairing/start", { DEVICE_NAME: PAIRING_DEVICE_NAME, DEVICE_ID: PAIRING_DEVICE_ID });
  const token = envelope.ITEM?.PAIRING_REQ_TOKEN;
  if (typeof token !== "number") throw new VizioApiError("The Vizio TV did not start pairing", 0);
  return token;
}

/** Tries each known SmartCast port until one starts pairing; returns the working port and the pairing token. */
export async function startPairingOnAnyPort(ipAddress: string): Promise<{ port: number; pairingToken: number }> {
  let lastError: unknown;
  for (const port of VIZIO_PORTS) {
    try {
      return { port, pairingToken: await startPairing(ipAddress, port) };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Finishes pairing with the on-screen PIN and returns the auth token to save. */
export async function finishPairing(ipAddress: string, port: number, pairingToken: number, pin: string): Promise<string> {
  const envelope = await vizioRequest({ ipAddress, port }, "PUT", "/pairing/pair", {
    DEVICE_ID: PAIRING_DEVICE_ID,
    CHALLENGE_TYPE: PIN_CHALLENGE_TYPE,
    RESPONSE_VALUE: pin,
    PAIRING_REQ_TOKEN: pairingToken,
  });
  const authToken = envelope.ITEM?.AUTH_TOKEN;
  if (typeof authToken !== "string" || authToken.length === 0) throw new VizioApiError("The PIN was not accepted", 0);
  return authToken;
}

/** True when the TV is on (its power_mode reads 1); standby reads 0. */
export async function isPoweredOn(target: VizioTarget): Promise<boolean> {
  const envelope = await vizioRequest(target, "GET", POWER_PATH);
  return envelope.ITEMS?.[0]?.VALUE === 1;
}

/** Presses one remote key. */
export async function pressKey(target: VizioTarget, key: VizioKey): Promise<void> {
  await vizioRequest(target, "PUT", KEY_COMMAND_PATH, { KEYLIST: [{ CODESET: key.codeset, CODE: key.code, ACTION: "KEYPRESS" }] });
}

/** Current volume as the TV reports it, or undefined when it has none to give. */
export async function readVolume(target: VizioTarget): Promise<number | undefined> {
  const value = (await vizioRequest(target, "GET", VOLUME_PATH)).ITEMS?.[0]?.VALUE;
  return typeof value === "number" ? value : undefined;
}

/** True when the TV reports itself muted, false when not, undefined when it does not say. */
export async function readMuted(target: VizioTarget): Promise<boolean | undefined> {
  const value = (await vizioRequest(target, "GET", MUTE_PATH)).ITEMS?.[0]?.VALUE;
  return typeof value === "string" ? value.toLowerCase() === "on" : undefined;
}

/** Name of the input the TV is showing (e.g. "HDMI-1"), or undefined when it does not say. */
export async function readCurrentInput(target: VizioTarget): Promise<string | undefined> {
  const value = (await vizioRequest(target, "GET", CURRENT_INPUT_PATH)).ITEMS?.[0]?.VALUE;
  return typeof value === "string" ? value : undefined;
}

/** Switches to a named input; the TV requires the hash of its current input setting to accept the change. */
export async function switchInput(target: VizioTarget, inputName: string): Promise<void> {
  const current = await vizioRequest(target, "GET", CURRENT_INPUT_PATH);
  const hashValue = current.ITEMS?.[0]?.HASHVAL;
  if (typeof hashValue !== "number") throw new VizioApiError("The Vizio TV did not say which input it is on, so it cannot switch", 0);
  await vizioRequest(target, "PUT", CURRENT_INPUT_PATH, { REQUEST: "MODIFY", VALUE: inputName, HASHVAL: hashValue });
}
