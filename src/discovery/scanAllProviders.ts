import { DiscoveredDevice, DiscoveryProvider } from "../core/discovery/DiscoveryProvider";

/**
 * Runs every given DiscoveryProvider concurrently and merges their results into one list —
 * ADR-HEARTH-095: SSDP (native, zero-Pi-dependency) and Family Command Center (broader network-
 * segment reach, household category labels) are independent, complementary sources, not a
 * primary/fallback pair. Neither provider failing (FCC unconfigured, SSDP's multicast entitlement
 * not yet granted on iOS) affects the other — each already degrades to "found nothing" on its own,
 * never throwing, so this only needs to merge whatever each one actually returned.
 *
 * Merged by IP address (the one field every provider can supply) — a device both sources find
 * keeps Family Command Center's richer result (a real hwaddr for dedup-on-add and household
 * category, versus SSDP's IP-only data), since that's the more useful entry to show, but still
 * surfaces only once.
 */
export async function scanAllProviders(providers: DiscoveryProvider[], signal?: AbortSignal): Promise<DiscoveredDevice[]> {
  const byIp = new Map<string, DiscoveredDevice>();

  await Promise.allSettled(
    providers.map((provider) =>
      provider.scan((device) => {
        const ip = String(device.metadata?.ipAddress ?? "");
        if (!ip) return;
        const existing = byIp.get(ip);
        // Prefer whichever entry already has an hwaddr (richer — Family Command Center's own
        // devices carry one, SSDP's never do) over a same-IP entry that doesn't.
        if (!existing || (!existing.metadata?.hwaddr && device.metadata?.hwaddr)) {
          byIp.set(ip, device);
        }
      }, signal)
    )
  );

  return Array.from(byIp.values());
}
