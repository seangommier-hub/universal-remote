import { useCallback, useEffect, useRef, useState } from "react";
import { BrandId } from "../discovery/brandRegistry";
import { DeviceLabel, DeviceLabels, labelKey, loadLabels, pushLabelToPi, saveLabels, withLabel } from "../discovery/discoveryLabels";
import { NetworkDevice } from "../discovery/discoverAll";

/** The person's own hide / brand decisions for network devices: kept on this phone, shared with the household when the Pi supports it (ADR-HEARTH-153). */
export function useDeviceLabels() {
  const [labels, setLabels] = useState<DeviceLabels>({});
  const latest = useRef<DeviceLabels>({});

  useEffect(() => {
    let cancelled = false;
    void loadLabels().then((stored) => {
      if (cancelled) return;
      latest.current = { ...stored, ...latest.current };
      setLabels(latest.current);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback((device: NetworkDevice, patch: DeviceLabel) => {
    latest.current = withLabel(latest.current, labelKey(device), patch);
    setLabels(latest.current);
    void saveLabels(latest.current);
    void pushLabelToPi(device, patch);
  }, []);

  const setHidden = useCallback((device: NetworkDevice, hidden: boolean) => apply(device, { hidden }), [apply]);
  const setBrand = useCallback((device: NetworkDevice, brand: BrandId) => apply(device, { brand }), [apply]);

  const markSupportRequested = useCallback((device: NetworkDevice) => apply(device, { supportRequested: true }), [apply]);

  return { labels, setHidden, setBrand, markSupportRequested };
}
