import { fccJsonRequest } from "../core/network/fccJsonRequest";
import { Device } from "../core/types/Device";
import { ConnectionState } from "../core/types/DeviceState";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { AutoCheckId } from "../discovery/brandSetupChecks";

const FCC_PROBE_PATH = "/api/integrations/hearth/devices";
const FCC_PROBE_TIMEOUT_MS = 6000;

export type FccProbe = "pending" | "ok" | "not-configured" | "unreachable";

export interface AutoCheckContext {
  device: Device;
  fcc: FccProbe;
  connection: ConnectionState;
}

/** Outcome of one automatic check: a tick or cross plus a plain reason. */
export interface AutoCheckResult {
  ok: boolean;
  reason: string;
}

/** Asks Family Command Center for its device list, the same cheap authenticated call used when saving its address. */
export async function probeFamilyCommandCenter(): Promise<FccProbe> {
  if ((await loadFamilyCommandCenterConfig()) === null) return "not-configured";
  try {
    await fccJsonRequest(FCC_PROBE_PATH, undefined, FCC_PROBE_TIMEOUT_MS);
    return "ok";
  } catch {
    return "unreachable";
  }
}

function hasMacAddress(device: Device): boolean {
  const mac = device.config?.hwaddr;
  return typeof mac === "string" && mac.trim().length > 0;
}

function evaluateFcc(fcc: FccProbe): AutoCheckResult | null {
  if (fcc === "pending") return null;
  if (fcc === "ok") return { ok: true, reason: "Reachable from this phone." };
  if (fcc === "not-configured") return { ok: false, reason: "Family Command Center isn't connected yet." };
  return { ok: false, reason: "Couldn't reach it from here. Is the Pi on, and this phone on Wi-Fi or the away address?" };
}

/** Result of an automatic check, or null while it is still being measured. */
export function evaluateAutoCheck(id: AutoCheckId, context: AutoCheckContext): AutoCheckResult | null {
  if (id === "fcc-reachable") return evaluateFcc(context.fcc);
  if (id === "mac-known") {
    return hasMacAddress(context.device)
      ? { ok: true, reason: "MAC address saved." }
      : { ok: false, reason: "No MAC address saved, so Wake-on-LAN has nowhere to aim." };
  }
  return context.connection === "connected"
    ? { ok: true, reason: "Answering right now." }
    : { ok: false, reason: "Not answering right now. Is it switched on and on this network?" };
}
