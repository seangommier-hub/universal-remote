import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { logger } from "../core/logging/logger";
import { Device } from "../core/types/Device";
import { DeviceLabels, loadLabels } from "../discovery/discoveryLabels";
import { findNewDevices, noticeKeys } from "../discovery/newDeviceAlert";
import { loadNoticed, NoticedDevices, saveNoticed, withNoticed } from "../discovery/noticedDevices";
import { getScanSnapshot, isScanRunning, PASSIVE_RESCAN_MIN_INTERVAL_MS, ScanSnapshot, shouldPassiveScan, subscribeToScans } from "../discovery/scanSnapshot";
import { scanNetworkQuietly } from "./useNetworkDevices";

const LOG_SCOPE = "new-devices";
// Waits a moment before deciding to scan, so a screen that is about to run its own scan (the list
// mounting, the app returning to the foreground) gets to start it first and this never doubles up.
const PASSIVE_CHECK_DELAY_MS = 4000;

interface NewDevicesOptions {
  devices: Device[];
  /** False for restricted (kid / guest) phones: nothing to add, so nothing to announce. */
  enabled: boolean;
  /** Whether a passive scan may run (the Family Command Center is set up on this phone). */
  canScan: boolean;
  /** Changes whenever the person may have hidden or re-labelled something elsewhere, so the saved labels are re-read. */
  labelsRefreshKey: string;
  /** The Discover screen is open: everything it lists counts as seen. */
  discoverOpen: boolean;
}

function useSnapshot(): ScanSnapshot | null {
  const [snapshot, setSnapshot] = useState<ScanSnapshot | null>(getScanSnapshot);
  useEffect(() => subscribeToScans(setSnapshot), []);
  return snapshot;
}

function useNoticed() {
  const [noticed, setNoticed] = useState<NoticedDevices | null>(null);
  const latest = useRef<NoticedDevices>([]);
  useEffect(() => {
    let cancelled = false;
    void loadNoticed().then((stored) => {
      if (cancelled) return;
      latest.current = withNoticed(stored, latest.current);
      setNoticed(latest.current);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const notice = useCallback((keys: string[]) => {
    latest.current = withNoticed(latest.current, keys);
    setNoticed(latest.current);
    void saveNoticed(latest.current);
  }, []);
  return { noticed, notice };
}

function useSavedLabels(refreshKey: string): DeviceLabels | null {
  const [labels, setLabels] = useState<DeviceLabels | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadLabels().then((stored) => {
      if (!cancelled) setLabels(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return labels;
}

/** Starts a quiet scan only when none is running and the last one is old; checked on mount, on return to the app, and every ten minutes while it is open. */
function usePassiveScan(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (!shouldPassiveScan({ snapshot: getScanSnapshot(), scanRunning: isScanRunning(), now: Date.now() })) return;
      scanNetworkQuietly().catch((error) => logger.warn(LOG_SCOPE, "Passive scan failed", { error: String(error) }));
    };
    const schedule = () => {
      clearTimeout(pending);
      pending = setTimeout(check, PASSIVE_CHECK_DELAY_MS);
    };
    schedule();
    const interval = setInterval(() => AppState.currentState === "active" && schedule(), PASSIVE_RESCAN_MIN_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => state === "active" && schedule());
    return () => {
      clearTimeout(pending);
      clearInterval(interval);
      subscription.remove();
    };
  }, [active]);
}

/**
 * ADR-HEARTH-222: the recognized, addable, not-yet-announced devices from the shared scan result,
 * with a way to mark them told. Reads scans the other screens already ran; its own quiet scan is
 * rate-limited (see usePassiveScan). Never adds anything.
 */
export function useNewDevices({ devices, enabled, canScan, labelsRefreshKey, discoverOpen }: NewDevicesOptions) {
  const snapshot = useSnapshot();
  const { noticed, notice } = useNoticed();
  const labels = useSavedLabels(labelsRefreshKey);
  usePassiveScan(enabled && canScan);

  const newDevices = useMemo(() => {
    if (!enabled || !snapshot || noticed === null || labels === null) return [];
    return findNewDevices(snapshot.devices, devices, labels, noticed);
  }, [enabled, snapshot, devices, labels, noticed]);

  const dismiss = useCallback(() => notice(noticeKeys(newDevices)), [notice, newDevices]);

  useEffect(() => {
    if (discoverOpen && newDevices.length > 0) notice(noticeKeys(newDevices));
  }, [discoverOpen, newDevices, notice]);

  return { count: newDevices.length, dismiss };
}
