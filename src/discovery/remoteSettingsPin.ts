import { fccFetch } from "../core/network/fccRequest";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// ADR-HEARTH-209, Pi adr/0283: the household's PIN for a physical remote's on-screen settings panel
// (where devices are added to the remote). The owner sets it here; the Pi keeps only a hash.

const PIN_PATH = "/api/integrations/hearth/physical-remote/settings-pin";
const REQUEST_TIMEOUT_MS = 8000;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const PIN_PATTERN = /^\d{4,8}$/;

/** True for 4 to 8 digits, the Pi's own rule. */
export function isValidRemoteSettingsPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

async function requireConfig() {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) throw new Error("Family Command Center isn't connected — add its address and token in Settings first.");
  return config;
}

function messageForStatus(status: number): string {
  if (status === HTTP_FORBIDDEN) return "Only the household owner can set the remote PIN.";
  if (status === HTTP_BAD_REQUEST) return "The PIN must be 4 to 8 digits.";
  return `Family Command Center returned ${status}.`;
}

/** Whether a remote settings PIN has been set for the household. */
export async function fetchRemoteSettingsPinIsSet(): Promise<boolean> {
  const response = await fccFetch(await requireConfig(), PIN_PATH, undefined, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw new Error(messageForStatus(response.status));
  return ((await response.json()) as { isSet?: boolean }).isSet === true;
}

/** Sets or changes the household's remote settings PIN. */
export async function saveRemoteSettingsPin(pin: string): Promise<void> {
  if (!isValidRemoteSettingsPin(pin)) throw new Error(messageForStatus(HTTP_BAD_REQUEST));
  const response = await fccFetch(await requireConfig(), PIN_PATH, { method: "PUT", body: JSON.stringify({ pin }) }, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw new Error(messageForStatus(response.status));
}
