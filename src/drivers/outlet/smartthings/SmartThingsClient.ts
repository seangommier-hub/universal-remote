import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";

// Course correction (ADR-HEARTH-042's 2026-09-11 update): a WEBHOOK_SMART_APP doesn't use a
// browser OAuth flow, so Hearth's phone never holds a SmartThings access token at all — SmartThings
// delivers tokens straight to the Family Command Center via the INSTALL/UPDATE lifecycle, and the
// Center is what actually calls SmartThings' Cloud API. This client talks to the Center's own proxy
// endpoints instead (family-command-center/adr/0157's matching update), reusing the same
// baseUrl+token pairing Hearth already has from Family Command Center discovery (ADR-HEARTH-010) —
// there's no separate SmartThings credential to store or refresh here at all.

const OUTLETS_PATH = "/api/integrations/hearth/smartthings/outlets";

export type SwitchState = "on" | "off" | "unknown";

export interface SmartThingsOutlet {
  id: string;
  /** The user-assigned name in the SmartThings app — what Hearth shows, same as every other discovered device's name being whatever the source system calls it. */
  label: string;
  state: SwitchState;
}

export class SmartThingsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

/** Thrown when Family Command Center isn't paired yet — SmartThings outlets are reached entirely through it, so there's nothing to sync without it, unlike a driver that could otherwise degrade to "not connected" per-device. */
export class FamilyCommandCenterNotConfiguredError extends Error {}

async function fccRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) {
    throw new FamilyCommandCenterNotConfiguredError("Family Command Center isn't paired yet — pair it first, then SmartThings outlets can sync.");
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    throw new SmartThingsApiError(`Family Command Center returned ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

/** Every switch-capability device the household granted Hearth access to when installing the SmartApp in the SmartThings mobile app — there's no separate "unsupported device" filtering to do here the way FamilyCommandCenterDiscoveryProvider does for TVs, since SmartThings' own install-time device picker is the discovery/pairing UI for this integration, not Hearth's. */
export async function listOutlets(): Promise<SmartThingsOutlet[]> {
  const { outlets } = await fccRequest<{ outlets: SmartThingsOutlet[] }>(OUTLETS_PATH);
  return outlets;
}

export async function setOutletState(deviceId: string, state: "on" | "off"): Promise<void> {
  await fccRequest(`${OUTLETS_PATH}/${deviceId}`, {
    method: "POST",
    body: JSON.stringify({ state }),
  });
}
