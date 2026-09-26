import { useCallback, useEffect, useRef, useState } from "react";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { discoverAll, NetworkDevice } from "../discovery/discoverAll";

export type NetworkScanStatus = "scanning" | "done";

/** A scan that does not touch any screen state — used to re-identify one device without blanking the list. */
export async function scanNetworkQuietly(): Promise<NetworkDevice[]> {
  return (await discoverAll()).devices;
}

/** Scans the network on mount and on demand; keeps the last list, plus the classified failure when the Pi could not be reached. */
export function useNetworkDevices() {
  const [status, setStatus] = useState<NetworkScanStatus>("scanning");
  const [devices, setDevices] = useState<NetworkDevice[]>([]);
  const [failure, setFailure] = useState<NetworkFailureDiagnosis | null>(null);
  const mounted = useRef(true);

  const rescan = useCallback(async (): Promise<NetworkDevice[]> => {
    setStatus("scanning");
    const result = await discoverAll();
    if (mounted.current) {
      setDevices(result.devices);
      setFailure(result.failure);
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

  return { status, devices, failure, rescan, replaceDevice };
}
