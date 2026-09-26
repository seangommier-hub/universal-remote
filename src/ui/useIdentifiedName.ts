import { useEffect, useState } from "react";
import { getBrand } from "../discovery/brandRegistry";
import { DeviceIdentity, resolveDisplayName } from "../discovery/deviceIdentity";
import { identifyDeviceByIp } from "../discovery/identifyDevice";
import type { BrandId } from "../discovery/brandRegistry";

// ADR-HEARTH-156: for the manual "Add by IP" form. Once a full IPv4 address is typed, asks the Pi
// who is there and offers the device's own name as a placeholder / prefill. Returns null until known.

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const TYPING_SETTLE_MS = 600;

/** True for a complete-looking IPv4 address, the only input worth asking the Pi about. */
export function isIdentifiableAddress(value: string): boolean {
  return IPV4_PATTERN.test(value.trim());
}

/** The name to show for an identity: the device's own name, else its vendor and model, else the brand's label. */
export function nameFromIdentity(identity: DeviceIdentity | null, brand: BrandId): string | null {
  if (!identity) return null;
  const entry = getBrand(brand);
  const { name, source } = resolveDisplayName({ reported: identity.name, vendor: entry.manufacturer, model: identity.model });
  return source === "device" || source === "vendor-model" ? name : null;
}

/** Looks up the device's own name for a typed address; the result is null while unknown. */
export function useIdentifiedName(ip: string, brand: BrandId): { name: string | null; identity: DeviceIdentity | null } {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);

  useEffect(() => {
    setIdentity(null);
    if (!isIdentifiableAddress(ip)) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      void identifyDeviceByIp(ip.trim()).then((found) => {
        if (!cancelled) setIdentity(found);
      });
    }, TYPING_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ip]);

  return { name: nameFromIdentity(identity, brand), identity };
}
