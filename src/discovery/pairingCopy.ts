import { classifyNetworkFailure, NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { PS5_PAIRING_POLL_INTERVAL_MS, PS5_PAIRING_POLL_MAX_ATTEMPTS } from "../drivers/gaming/ps5/Ps5Client";
import { LG_PAIRING_TIMEOUT_MS } from "../drivers/tv/lg/LgWebOsClient";
import { SAMSUNG_PAIRING_TIMEOUT_MS, SamsungPairingError } from "../drivers/tv/samsung/SamsungTizenClient";
import { APPLE_TV_PAIRING_POLL_INTERVAL_MS, APPLE_TV_PAIRING_POLL_MAX_ATTEMPTS } from "../drivers/tv/appletv/AppleTvClient";
import { BrandId } from "./brandRegistry";
import { HUE_PAIRING_MAX_WAIT_MS, HuePairingTimedOutError } from "./huePairing";

// ADR-HEARTH-155: every pairing screen's "what to look at on the TV" text and every pairing
// failure's plain-language explanation live here, as pure functions, so the copy is written once
// and tested per brand instead of being scattered through screens and driver error strings.

export type PairingPromptId = BrandId | "ps5-pin";

export interface PairingPrompt {
  /** Card title, e.g. "Look at your LG TV". */
  heading: string;
  /** Plain description of what will appear and what to choose. */
  instruction: string;
  /** The real time limit of this step in ms, or null when it has none. */
  timeoutMs: number | null;
}

const PAIRING_PROMPTS: Partial<Record<PairingPromptId, PairingPrompt>> = {
  lg: {
    heading: "Look at your LG TV",
    instruction: 'A box saying "LG Remote App wants to connect" will appear on the TV. Choose Yes / OK with the TV remote.',
    timeoutMs: LG_PAIRING_TIMEOUT_MS,
  },
  samsung: {
    heading: "Look at your Samsung TV",
    instruction: 'A box asking whether to allow "Hearth" to connect will appear on the TV. Choose Allow with the TV remote.',
    timeoutMs: SAMSUNG_PAIRING_TIMEOUT_MS,
  },
  appletv: {
    heading: "Look at your Apple TV",
    instruction: "A 4-digit PIN is showing on the Apple TV screen. Type it in below.",
    timeoutMs: APPLE_TV_PAIRING_POLL_INTERVAL_MS * APPLE_TV_PAIRING_POLL_MAX_ATTEMPTS,
  },
  vizio: {
    heading: "Look at your Vizio TV",
    instruction: "A PIN is showing on the TV screen. Type it in below.",
    timeoutMs: null,
  },
  hue: {
    heading: "Look at your Hue bridge",
    instruction: "Press the round link button on top of the bridge now. Hearth keeps checking until it feels the press.",
    timeoutMs: HUE_PAIRING_MAX_WAIT_MS,
  },
  ps5: {
    heading: "Checking your sign-in",
    instruction: "Hearth is passing your PlayStation sign-in to Family Command Center. This usually takes a few seconds.",
    timeoutMs: PS5_PAIRING_POLL_INTERVAL_MS * PS5_PAIRING_POLL_MAX_ATTEMPTS,
  },
  "ps5-pin": {
    heading: "Look at your PS5",
    instruction: "On the PS5 open Settings > System > Remote Play > Link Device. An 8-digit code appears; type it in below.",
    timeoutMs: PS5_PAIRING_POLL_INTERVAL_MS * PS5_PAIRING_POLL_MAX_ATTEMPTS,
  },
  sony: { heading: "Connecting to your Sony TV", instruction: "Make sure the TV is on. Hearth is checking the pre-shared key with it.", timeoutMs: null },
  xbox: { heading: "Adding your Xbox", instruction: "Hearth is saving the console. It is not woken up during setup.", timeoutMs: null },
  homeassistant: { heading: "Adding your Home Assistant device", instruction: "Hearth is checking the access token with Home Assistant.", timeoutMs: null },
  smartthings: { heading: "Adding your outlet", instruction: "Hearth is linking the outlet through Family Command Center.", timeoutMs: null },
};

/** What to show the user while a brand's pairing step is waiting, or null when the brand has no waiting step. */
export function pairingPromptFor(id: PairingPromptId): PairingPrompt | null {
  return PAIRING_PROMPTS[id] ?? null;
}

export type PairingFailureKind =
  | "timeout"
  | "not-allowed"
  | "stale-pairing"
  | "certificate"
  | "wrong-psk"
  | "roku-permission"
  | "wrong-pin"
  | "bad-redirect"
  | "not-same-network"
  | "unreachable"
  | "unknown";

export interface PairingFailureCopy {
  kind: PairingFailureKind;
  title: string;
  /** Plain-language explanation including the exact place to look on the device. */
  message: string;
  diagnosis: NetworkFailureDiagnosis | null;
}

const SAMSUNG_DEVICE_MANAGER_PATH = "Device Manager > External Device Manager > Device Connect Manager > Access Notification";
const SONY_PSK_PATH = "Settings > Network > Home network setup > IP control > Pre-shared key";
const ROKU_PERMISSIVE_PATH = "Settings > System > Advanced system settings > Control by mobile apps > Network access > Permissive";

const TIMEOUT_PATTERN = /timed? ?out|timeout|took too long/i;
const STALE_PAIRING_PATTERN = /isn't recognizing a previous pairing/i;
const CERTIFICATE_PATTERN = /blacklist|certificate/i;
const DENIED_PATTERN = /denied|unauthorized|not authorized/i;
const HTTP_403_PATTERN = /\bHTTP 403\b|\berror 403\b|\bforbidden\b/i;
const HTTP_401_403_PATTERN = /\bHTTP 40[13]\b|\berror 40[13]\b|\bforbidden\b/i;
const PIN_PATTERN = /\bpin\b|invalid|incorrect|wrong|mismatch|rejected/i;
const PS5_CODE_PATTERN = /\bcode\b|\bpin\b|invalid|incorrect|wrong|mismatch|rejected/i;
const VIZIO_REFUSED_PATTERN = /blocked|refused/i;
const REDIRECT_PATTERN = /redirect|sign.?in|login|oauth|\burl\b/i;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : String(error ?? "");
}

function copy(kind: PairingFailureKind, title: string, message: string, diagnosis: NetworkFailureDiagnosis | null = null): PairingFailureCopy {
  return { kind, title, message, diagnosis };
}

function describeTvFailure(brandId: "lg" | "samsung", label: string, error: unknown, message: string): PairingFailureCopy | null {
  if (STALE_PAIRING_PATTERN.test(message)) {
    return copy("stale-pairing", "Pairing was forgotten", `The ${label} isn't recognizing a previous pairing (a TV update or reset can clear it). Try again and choose ${brandId === "lg" ? "Yes / OK" : "Allow"} on the TV when the box appears.`);
  }
  if (brandId === "lg" && CERTIFICATE_PATTERN.test(message)) {
    return copy("certificate", "TV refused the request", "This LG TV's software rejected Hearth's security certificate. Update the TV to its latest software (Settings > General > About This TV > Check for Updates) and try again.");
  }
  if (brandId === "samsung" && (error instanceof SamsungPairingError || DENIED_PATTERN.test(message))) {
    return copy("not-allowed", "Samsung rejected the request", `Samsung says this TV rejected the request. Turn on ${SAMSUNG_DEVICE_MANAGER_PATH} and choose "First time only", then try again and choose Allow.`);
  }
  if (TIMEOUT_PATTERN.test(message)) {
    const choice = brandId === "lg" ? "Yes / OK" : "Allow";
    return copy("timeout", "No answer from the TV", `You didn't tap ${choice} in time. Watch the ${label} screen, then try again and choose ${choice} when the box appears.`);
  }
  return null;
}

function describeSonyFailure(message: string): PairingFailureCopy | null {
  if (!HTTP_401_403_PATTERN.test(message)) return null;
  return copy("wrong-psk", "Pre-shared key doesn't match", `The PSK doesn't match. On the TV: ${SONY_PSK_PATH}. Check it and try again.`);
}

function describeRokuFailure(message: string): PairingFailureCopy | null {
  if (!HTTP_403_PATTERN.test(message)) return null;
  return copy("roku-permission", "Roku is blocking control", `On the Roku: ${ROKU_PERMISSIVE_PATH}. Then try again.`);
}

function describeAppleTvFailure(message: string): PairingFailureCopy | null {
  if (TIMEOUT_PATTERN.test(message)) return copy("timeout", "PIN not confirmed in time", "The Apple TV didn't confirm the PIN in time. Try again and type the new PIN shown on the TV.");
  if (PIN_PATTERN.test(message)) return copy("wrong-pin", "That PIN didn't work", "The Apple TV didn't accept that PIN. Try again and type the new 4-digit PIN now showing on the TV.");
  return null;
}

function describeVizioFailure(message: string): PairingFailureCopy | null {
  if (TIMEOUT_PATTERN.test(message)) return copy("timeout", "PIN not confirmed in time", "The Vizio TV didn't answer in time. Try again and type the new PIN shown on the TV.");
  if (PIN_PATTERN.test(message) || VIZIO_REFUSED_PATTERN.test(message)) return copy("wrong-pin", "That PIN didn't work", "The Vizio TV didn't accept that PIN. Try again and type the new PIN now showing on the TV.");
  return null;
}

function describePs5Failure(message: string): PairingFailureCopy | null {
  if (TIMEOUT_PATTERN.test(message)) return copy("timeout", "PS5 pairing timed out", "Nothing finished in time. Try again, and enter the PS5's 8-digit code promptly.");
  if (REDIRECT_PATTERN.test(message)) return copy("bad-redirect", "Sign-in wasn't recognized", "Hearth couldn't use that PlayStation sign-in. Sign in again, then copy the whole address from the blank page.");
  if (PS5_CODE_PATTERN.test(message)) return copy("wrong-pin", "That code didn't work", "The PS5 didn't accept that code. On the PS5 open Settings > System > Remote Play > Link Device and enter the new 8-digit code.");
  return null;
}

function describeHueFailure(error: unknown, diagnosis: NetworkFailureDiagnosis): PairingFailureCopy | null {
  if (error instanceof HuePairingTimedOutError) return copy("timeout", "Link button wasn't pressed", "The link button wasn't pressed in time. Press the round button on top of the bridge, then try again.");
  if (diagnosis.kind === "lan-blocked") return copy("not-same-network", "Can't reach the bridge", "Hearth can't reach the Hue bridge. Your phone must be on the same Wi-Fi as the bridge, and the address must be the bridge's (Hue app > Settings > My Bridge).", diagnosis);
  return null;
}

function brandSpecificFailure(brandId: BrandId, label: string, error: unknown, message: string, diagnosis: NetworkFailureDiagnosis): PairingFailureCopy | null {
  switch (brandId) {
    case "lg":
    case "samsung":
      return describeTvFailure(brandId, label, error, message);
    case "sony":
      return describeSonyFailure(message);
    case "roku":
      return describeRokuFailure(message);
    case "appletv":
      return describeAppleTvFailure(message);
    case "vizio":
      return describeVizioFailure(message);
    case "ps5":
      return describePs5Failure(message);
    case "hue":
      return describeHueFailure(error, diagnosis);
    default:
      return null;
  }
}

/** Turns any pairing failure into plain language with the exact place to look; kind "unknown" means the raw text is all there is. */
export function describePairingFailure(brandId: BrandId, brandLabel: string, error: unknown): PairingFailureCopy {
  const message = messageOf(error);
  const diagnosis = classifyNetworkFailure(error);
  const specific = brandSpecificFailure(brandId, brandLabel, error, message, diagnosis);
  if (specific) return specific;
  if (diagnosis.kind === "lan-blocked") {
    return copy("unreachable", "Can't reach the device", `Couldn't reach the ${brandLabel}. Make sure it's on and on the same Wi-Fi as this phone.`, diagnosis);
  }
  if (diagnosis.kind !== "unknown") return copy("unreachable", "Family Command Center problem", diagnosis.summary, diagnosis);
  return copy("unknown", "Couldn't connect", message);
}
