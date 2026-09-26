import { useCallback, useEffect, useRef, useState } from "react";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { discoverAll, NetworkDevice } from "../discovery/discoverAll";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { ScanStatus } from "../discovery/discoverySections";

export type NetworkScanStatus = ScanStatus;

/** A scan that does not touch any screen state — used to re-identify one device without blanking the list. */
export async function scanNetworkQuietly(): Promise<NetworkDevice[]> {
  return (await discoverAll()).devices;
}

/** Scans the network on mount and on demand; keeps the last list, when it finished, and the classified failure when the Pi could not be reached. */
export function useNetworkDevices() {
  const [status, setStatus] = useState<NetworkScanStatus>("scanning");
  const [devices, setDevices] = useState<NetworkDevice[]>([]);
  const [failure, setFailure] = useState<NetworkFailureDiagnosis | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [fccConfigured, setFccConfigured] = useState<boolean | null>(null);
  const mounted = useRef(true);

  const rescan = useCallback(async (): Promise<NetworkDevice[]> => {
    setStatus("scanning");
    const [result, config] = await Promise.all([discoverAll(), loadFamilyCommandCenterConfig().catch(() => null)]);
    if (mounted.current) {
      setDevices(result.devices);
      setFailure(result.failure);
      setFccConfigured(config !== null);
      setScannedAt(Date.now());
      setStatus("done");
    }
    return result.devices;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void rescan();
    return () => {
      mounted.current = false;
    };
  }, [rescan]);

  const replaceDevice = useCallback((updated: NetworkDevice) => {
    setDevices((current) => current.map((device) => (device.ip === updated.ip ? updated : device)));
  }, []);

  return { status, devices, failure, scannedAt, fccConfigured, rescan, replaceDevice };
}
