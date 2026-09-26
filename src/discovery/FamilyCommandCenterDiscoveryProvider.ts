import { DiscoveredDevice, DiscoveryProvider } from "../core/discovery/DiscoveryProvider";
import { DeviceCategory } from "../core/types/Device";
import { FccNotConfiguredError, FccTokenRejectedError, FccUnreachableError } from "../core/network/fccErrors";
import { fccFetch, isFccTimeout } from "../core/network/fccRequest";
import { matchBrandByText } from "./brandRegistry";
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
const HTTP_UNAUTHORIZED = 401;

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

// ADR-HEARTH-148: brand matching (hostname + MAC vendor text) now lives in brandRegistry.ts, the
// single source for every brand. Xbox is recognized there too: its row asks for the Live ID inline
// instead of failing on a connect that can never succeed (superseding ADR-HEARTH-064's exclusion).

function classify(device: LanDevice): { manufacturer: string; category: DeviceCategory; driverId: string } {
  const haystack = `${device.name ?? ""} ${device.vendor ?? ""}`;
  const brand = matchBrandByText(haystack);
  if (brand) return { manufacturer: brand.manufacturer, category: brand.category, driverId: brand.driverId };
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
      throw new FccNotConfiguredError("Family Command Center isn't connected yet — add its address and token in Settings first.");
    }

    let res: Response;
    try {
      res = await fccFetch(config, "/api/integrations/hearth/devices", { signal }, SCAN_TIMEOUT_MS);
    } catch (err) {
      if (isFccTimeout(err) && !signal?.aborted) {
        throw new FccUnreachableError(`Family Command Center didn't respond within ${SCAN_TIMEOUT_MS / 1000} seconds — check it's reachable and try again.`);
      }
      throw new FccUnreachableError(err instanceof Error ? err.message : String(err));
    }
    if (res.status === HTTP_UNAUTHORIZED) throw new FccTokenRejectedError("Family Command Center rejected the saved token.");
    if (!res.ok) throw new Error(`Family Command Center returned ${res.status}.`);

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
