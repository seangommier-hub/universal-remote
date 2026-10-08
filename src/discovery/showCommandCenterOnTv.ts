import { Device } from "../core/types/Device";
import { fccFetch } from "../core/network/fccRequest";
import { LG_WEBOS_DRIVER_ID } from "../drivers/tv/lg/LgWebOsDriver";
import { SONY_BRAVIA_DRIVER_ID } from "../drivers/tv/sony/SonyBraviaDriver";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// ADR-HEARTH-225: switches a TV to the Family Command Center dashboard. The Pi runs the per-brand
// launcher (it holds Hearth's own pairing for the TV), so this is one call to the Pi, not a TV
// protocol the phone speaks itself.

export const SHOW_COMMAND_CENTER_PATH = "/api/integrations/hearth/show-command-center";
export const SHOW_COMMAND_CENTER_TIMEOUT_MS = 30_000;

export type CommandCenterTvKind = "lg-webos" | "sony-bravia";

const TV_KIND_BY_DRIVER: Record<string, CommandCenterTvKind> = {
  [LG_WEBOS_DRIVER_ID]: "lg-webos",
  [SONY_BRAVIA_DRIVER_ID]: "sony-bravia",
};

/** Which launcher the Pi should use for this device, or undefined when the Pi can't switch it (Samsung, Roku, ...). */
export function commandCenterTvKind(device: Device): CommandCenterTvKind | undefined {
  return TV_KIND_BY_DRIVER[device.driverId];
}

/** The TV's saved address, or undefined for a device saved without one. */
function savedIpAddress(device: Device): string | undefined {
  const ip = device.config?.ipAddress;
  return typeof ip === "string" && ip.length > 0 ? ip : undefined;
}

/** Asks Family Command Center to put the command center on this TV's screen; throws with a plain reason on failure. */
export async function showCommandCenterOnTv(device: Device): Promise<void> {
  const kind = commandCenterTvKind(device);
  const ip = savedIpAddress(device);
  if (!kind || !ip) throw new Error("The command center can't switch this TV by itself.");
  const config = await loadFamilyCommandCenterConfig();
  if (!config) throw new Error("Family Command Center isn't connected — add its address and token in Settings first.");
  const response = await fccFetch(config, SHOW_COMMAND_CENTER_PATH, { method: "POST", body: JSON.stringify({ kind, ip }) }, SHOW_COMMAND_CENTER_TIMEOUT_MS);
  if (response.status === 401) throw new Error("Family Command Center rejected the saved token.");
  if (!response.ok) throw new Error("Couldn't reach the TV. Is it turned on?");
}
