import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { discoverAll, DiscoverAllResult, NetworkDevice } from "../discovery/discoverAll";
import { loadFamilyCommandCenterConfig } from "../discovery/familyCommandCenterConfig";
import { ScanStatus } from "../discovery/discoverySections";
import { shouldRescanOnForeground } from "../discovery/scanProgress";
import { publishScan, trackScan } from "../discovery/scanSnapshot";

export type NetworkScanStatus = ScanStatus;

/** The one place a scan runs: counted as in flight, and its result shared when the Pi was reachable (ADR-HEARTH-222). */
async function scanNetwork(): Promise<DiscoverAllResult> {
  const result = await trackScan(discoverAll);
  if (!result.failure) publishScan(result.devices);
  return result;
}

/** A scan that does not touch any screen state — used to re-identify one device without blanking the list. */
export async function scanNetworkQuietly(): Promise<NetworkDevice[]> {
  return (await scanNetwork()).devices;
}

/** Scans the network on mount and on demand; keeps the last list, when it finished, and the classified failure when the Pi could not be reached. */
export function useNetworkDevices() {
  const [status, setStatus] = useState<NetworkScanStatus>("scanning");
  const [devices, setDevices] = useState<NetworkDevice[]>([]);
  const [failure, setFailure] = useState<NetworkFailureDiagnosis | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [fccConfigured, setFccConfigured] = useState<boolean | null>(null);
  const mounted = useRef(true);

  const rescan = useCallback(async (): Promise<NetworkDevice[]> => {
    setStatus("scanning");
    setScanStartedAt(Date.now());
    const [result, config] = await Promise.all([scanNetwork(), loadFamilyCommandCenterConfig().catch(() => null)]);
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

  // ADR-HEARTH-167: coming back to the app (e.g. after turning Local Network on in Settings) re-scans on its own.
  const latest = useRef({ status, scannedAt });
  latest.current = { status, scannedAt };
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const { status: current, scannedAt: last } = latest.current;
      if (next === "active" && shouldRescanOnForeground({ scanning: current === "scanning", scannedAt: last, now: Date.now() })) void rescan();
    });
    return () => subscription.remove();
  }, [rescan]);

  const replaceDevice = useCallback((updated: NetworkDevice) => {
    setDevices((current) => current.map((device) => (device.ip === updated.ip ? updated : device)));
  }, []);

  return { status, devices, failure, scannedAt, scanStartedAt, fccConfigured, rescan, replaceDevice };
}
