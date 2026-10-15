import { Device } from "../../core/types/Device";
import { findMacByIp } from "../../discovery/familyCommandCenterDeviceLookup";
import { sendWakeOnLan } from "../../core/network/wakeOnLan";
import { logger } from "../../core/logging/logger";

const LOG_SCOPE = "AutoWakeOnReconnect";

/**
 * Best-effort Wake-on-LAN for a TV whose background reconnect just failed (ADR-HEARTH-227). A TV
 * in low-power network standby answers neither ping nor SSAP/IP-control, which the normal
 * reconnect backoff (LgWebOsDriver/SonyBraviaDriver/SamsungTizenDriver) cannot distinguish from
 * "genuinely off" or "unplugged" -- it just keeps retrying a connection the TV will never answer
 * until someone presses the explicit Power On button, which is this exact Wake-on-LAN path
 * (`executeWakeOnLan` in each driver), just never fired automatically. This is that same MAC
 * resolution + WoL send, reused so a merely-sleeping TV wakes itself up.
 *
 * Resolves the MAC from `device.config.hwaddr`, falling back to a fresh Family Command Center
 * lookup by IP for a device paired before hwaddr-saving existed (ADR-HEARTH-017) -- same fallback
 * `executeWakeOnLan` already has. Never throws: a device with no resolvable MAC, or a WoL send
 * that fails, just means no automatic wake happens this time -- the caller's own normal reconnect
 * backoff is unaffected either way, exactly as if this function had never been called.
 */
export async function tryAutoWakeOnLan(device: Device): Promise<boolean> {
  const hwaddr = device.config?.hwaddr;
  const ipAddress = device.config?.ipAddress;
  try {
    const mac = typeof hwaddr === "string" ? hwaddr : typeof ipAddress === "string" ? await findMacByIp(ipAddress) : undefined;
    if (!mac) return false;
    if (device.config && typeof hwaddr !== "string") device.config.hwaddr = mac;
    await sendWakeOnLan(mac);
    return true;
  } catch (err) {
    logger.warn(LOG_SCOPE, `${device.name} automatic wake failed`, { message: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
