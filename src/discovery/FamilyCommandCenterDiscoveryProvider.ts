import { DiscoveredDevice, DiscoveryProvider } from "../core/discovery/DiscoveryProvider";
import { DeviceCategory } from "../core/types/Device";
import { SONY_BRAVIA_DRIVER_ID } from "../drivers/tv/sony/SonyBraviaDriver";
import { SAMSUNG_TIZEN_DRIVER_ID } from "../drivers/tv/samsung/SamsungTizenDriver";
import { LG_WEBOS_DRIVER_ID } from "../drivers/tv/lg/LgWebOsDriver";
import { ROKU_ECP_DRIVER_ID } from "../drivers/streaming/roku/RokuEcpDriver";
import { YAMAHA_MUSICCAST_DRIVER_ID } from "../drivers/tv/yamaha/YamahaMusicCastDriver";
import { KASA_PLUG_DRIVER_ID } from "../drivers/outlet/kasa/KasaPlugDriver";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// Discovery via the Family Command Center's own Pi-hole-backed device
// inventory (ADR-HEARTH-010) instead of mDNS/SSDP -- avoids the Expo
// Development Build jump Phase 3 of the roadmap otherwise requires, since
// this is a plain HTTP call. Real local-network discovery (any brand not
// wired into this specific household's Pi) is still the unimplemented
// long-term answer -- this provider only ever surfaces what that one
// household's network already knows about.

// Real-hardware finding (2026-09-09): this fetch previously had no timeout at all, unlike
// every other network call in this codebase (see httpRelayFallback.ts's own
// DIRECT_TIMEOUT_MS). A slow/hung response left DiscoverDevicesScreen stuck on "Scanning..."
// indefinitely, with no error and no way to recover short of leaving the screen -- exactly
// what a hung request looks like to a user with no diagnostic access. Now aborts and surfaces
// a real, retry-able error instead.
const SCAN_TIMEOUT_MS = 8000;

interface LanDevice {
  hwaddr: string;
  ip: string;
  name: string | null;
  vendor: string | null;
  /** A household-labeled category from the Family Command Center dashboard (2026-09-19,
   * ADR-HEARTH-094) — deliberately a plain string here, not Hearth's own DeviceCategory type
   * (this is a different vocabulary entirely: "is this a phone/computer/smart device", not "what
   * kind of controllable device is this"). Confirmed with Sean before this field started crossing
   * the endpoint's own documented no-Supabase-data boundary — only the category bucket, never the
   * household's human-typed device nickname. Absent/null whenever nothing's been labeled, or the
   * lookup failed — never something to treat as authoritative. */
  category: string | null;
}

// Matched against BOTH the device's DHCP hostname and its MAC vendor string
// -- this household's own data showed vendor was blank for some devices
// whose hostname was still identifying (e.g. "SonyTV"), and vice versa.
// Order matters only in that the first match wins; brands are distinct
// enough in practice that this hasn't needed to.
const BRAND_MATCHERS: { pattern: RegExp; manufacturer: string; category: DeviceCategory; driverId: string }[] = [
  { pattern: /sony/i, manufacturer: "Sony", category: "tv", driverId: SONY_BRAVIA_DRIVER_ID },
  { pattern: /samsung/i, manufacturer: "Samsung", category: "tv", driverId: SAMSUNG_TIZEN_DRIVER_ID },
  { pattern: /\blg\b|webos/i, manufacturer: "LG", category: "tv", driverId: LG_WEBOS_DRIVER_ID },
  { pattern: /roku/i, manufacturer: "Roku", category: "streaming", driverId: ROKU_ECP_DRIVER_ID },
  { pattern: /yamaha/i, manufacturer: "Yamaha", category: "tv", driverId: YAMAHA_MUSICCAST_DRIVER_ID },
  // Unlike Xbox/SmartThings above, KasaPlugDriver's connect() needs only config.ipAddress (see
  // KasaPlugDriver.ts's requireConfig) -- exactly what this screen's "Connect" tile already
  // builds from discovery data alone, so auto-matching is safe here the same way it is for every
  // TV brand. "TP-Link"/"TP-LINK TECHNOLOGIES" is that vendor's real, standard MAC OUI string
  // (unlike the other entries above, this one isn't yet confirmed against a live device on this
  // specific household's network -- no Kasa plug has shown up in a real scan as of 2026-09-15) --
  // a mismatch fails safe to "Unknown" with manual add still available, same as any brand here.
  { pattern: /tp-?link|\bkasa\b/i, manufacturer: "TP-Link", category: "outlet", driverId: KASA_PLUG_DRIVER_ID },
];

// Real household data (2026-09-13): this household's own router DHCP hostnames literally contain
// "XboxOne" — but XboxDriver is deliberately NOT added to BRAND_MATCHERS above. Every other entry
// there drives this screen's "Connect" button, which builds config from discovery data alone
// (ipAddress/hwaddr) and calls driver.connect() directly — for Xbox that config can never include
// a Live ID (nothing on the network exposes it, see XboxDriver.ts), so connect() would always throw
// a confusing "missing liveId" error the tile gives no way to fix. Left classified as "Unknown" —
// which the ADR-HEARTH-062 "Add manually as..." link already handles correctly for every tile,
// known brand or not, with the IP pre-filled into AddXboxDeviceScreen's own Live ID prompt. See
// ADR-HEARTH-064.

function classify(device: LanDevice): { manufacturer: string; category: DeviceCategory; driverId: string } {
  const haystack = `${device.name ?? ""} ${device.vendor ?? ""}`;
  for (const matcher of BRAND_MATCHERS) {
    if (matcher.pattern.test(haystack)) {
      return { manufacturer: matcher.manufacturer, category: matcher.category, driverId: matcher.driverId };
    }
  }
  // No recognized brand -- still surfaced (never silently dropped), just
  // with an empty driverId so the UI can show it as "seen on your network,
  // not yet supported" rather than pretending it doesn't exist.
  return { manufacturer: device.vendor || "Unknown", category: "other", driverId: "" };
}

export const FAMILY_COMMAND_CENTER_DISCOVERY_ID = "family-command-center-lan";

export class FamilyCommandCenterDiscoveryProvider implements DiscoveryProvider {
  id = FAMILY_COMMAND_CENTER_DISCOVERY_ID;
  displayName = "Your home network (via Family Command Center)";

  async scan(onFound: (device: DiscoveredDevice) => void, signal?: AbortSignal): Promise<void> {
    const config = await loadFamilyCommandCenterConfig();
    if (!config) {
      throw new Error("Family Command Center isn't connected yet — add its address and token in Settings first.");
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), SCAN_TIMEOUT_MS);
    const onCallerAbort = () => timeoutController.abort();
    signal?.addEventListener("abort", onCallerAbort);

    let res: Response;
    try {
      res = await fetch(`${config.baseUrl}/api/integrations/hearth/devices`, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: timeoutController.signal,
      });
    } catch (err) {
      if (timeoutController.signal.aborted && !signal?.aborted) {
        throw new Error(`Family Command Center didn't respond within ${SCAN_TIMEOUT_MS / 1000} seconds — check it's reachable and try again.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onCallerAbort);
    }
    if (!res.ok) {
      throw new Error(res.status === 401 ? "Family Command Center rejected the saved token." : `Family Command Center returned ${res.status}.`);
    }

    const { devices } = (await res.json()) as { devices: LanDevice[] };
    for (const device of devices) {
      if (signal?.aborted) return;
      const { manufacturer, category, driverId } = classify(device);
      onFound({
        id: `fcc-${device.hwaddr}`,
        name: device.name ?? device.ip,
        category,
        manufacturer,
        driverId,
        metadata: { ipAddress: device.ip, hwaddr: device.hwaddr, householdCategory: device.category },
      });
    }
  }
}
