import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeviceOutageTracker } from "../core/network/deviceOutageTracker";
import { getFccOutageMs, subscribeFccOutage } from "../core/network/fccOutage";
import { stateNeedsRePair } from "../core/state/needsRePair";
import type { StateStore } from "../core/state/StateStore";
import type { Device } from "../core/types/Device";
import { demoOfflineParam, offlineClock, startDemoOutage } from "../demo/demoOffline";
import { isDemoMode } from "../demo/demoMode";
import { probeFccHealth } from "../discovery/familyCommandCenterHealth";
import { chooseOfflineAlert, FCC_ALERT_KEY, OfflineAlert } from "./chooseOfflineAlert";

// Drives the calm offline banner on the Devices tab (ADR-HEARTH-172) from state Hearth already has:
// the relay outage record, plus each device's connection state. Re-evaluates on a slow tick, and
// probes the Pi's health route once a minute while the tab is open so a dead relay is noticed even
// when nothing else talks to it.

const EVALUATE_INTERVAL_MS = 15 * 1000;
const HEALTH_PROBE_INTERVAL_MS = 60 * 1000;

interface UseOfflineAlertInput {
  devices: readonly Device[];
  stateStore: StateStore;
  fccConfigured: boolean;
}

export interface OfflineAlertControls {
  alert: OfflineAlert | null;
  /** Hides the current alert until its problem clears and comes back. */
  dismiss: () => void;
  /** Asks the Pi right now, for the relay banner's Retry. */
  recheckFcc: () => void;
}

function useTrackedOutages(devices: readonly Device[], stateStore: StateStore, tick: () => void): DeviceOutageTracker {
  const trackerRef = useRef<DeviceOutageTracker>(new DeviceOutageTracker());
  useEffect(() => {
    const tracker = trackerRef.current;
    tracker.retainOnly(devices.map((device) => device.id));
    const observe = (id: string, connection: "connected" | "disconnected" | "unknown", waking: boolean) => {
      tracker.observe(id, connection, waking, offlineClock());
      tick();
    };
    const unsubscribers = devices.map((device) => {
      const initial = stateStore.get(device.id);
      tracker.observe(device.id, initial.connection, initial.values.waking === true, offlineClock());
      return stateStore.subscribe(device.id, (state) => observe(device.id, state.connection, state.values.waking === true));
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [devices, stateStore, tick]);
  return trackerRef.current;
}

function useEvaluationTick(): [number, () => void] {
  const [tickCount, setTickCount] = useState(0);
  const tick = useCallback(() => setTickCount((count) => count + 1), []);
  useEffect(() => {
    const timer = setInterval(tick, EVALUATE_INTERVAL_MS);
    const unsubscribe = subscribeFccOutage(tick);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [tick]);
  return [tickCount, tick];
}

/** The single offline alert to show (or null), with dismiss and relay-recheck actions. */
export function useOfflineAlert({ devices, stateStore, fccConfigured }: UseOfflineAlertInput): OfflineAlertControls {
  const [tickCount, tick] = useEvaluationTick();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const tracker = useTrackedOutages(devices, stateStore, tick);

  useEffect(() => {
    if (!fccConfigured || isDemoMode()) return undefined;
    void probeFccHealth();
    const timer = setInterval(() => void probeFccHealth(), HEALTH_PROBE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fccConfigured]);

  useEffect(() => {
    const kind = demoOfflineParam();
    return kind ? startDemoOutage(kind, devices, stateStore) : undefined;
  }, [devices, stateStore]);

  const { candidate, activeKeys } = useMemo(() => {
    const now = offlineClock();
    const outages = tracker.outages(now);
    const fccOutageMs = getFccOutageMs();
    const deviceNames = new Map(devices.map((device) => [device.id, device.name]));
    const keys = new Set<string>(outages.map((outage) => `device:${outage.deviceId}`));
    if (fccConfigured && fccOutageMs !== null) keys.add(FCC_ALERT_KEY);
    const rePairDeviceIds = new Set(devices.filter((device) => stateNeedsRePair(stateStore.get(device.id))).map((device) => device.id));
    rePairDeviceIds.forEach((deviceId) => keys.add(`device:${deviceId}`));
    const chosen = chooseOfflineAlert({ fccOutageMs, fccConfigured, outages, deviceNames, dismissed, rePairDeviceIds });
    return { candidate: chosen, activeKeys: keys };
    // tickCount re-runs this on a timer and on every state or outage change.
  }, [tickCount, tracker, devices, stateStore, fccConfigured, dismissed]);

  useEffect(() => {
    if (Array.from(dismissed).some((key) => !activeKeys.has(key))) {
      setDismissed((current) => new Set(Array.from(current).filter((key) => activeKeys.has(key))));
    }
  }, [activeKeys, dismissed]);

  const dismiss = useCallback(() => {
    if (candidate) setDismissed((current) => new Set(current).add(candidate.key));
  }, [candidate]);
  const recheckFcc = useCallback(() => void probeFccHealth(), []);

  return { alert: candidate, dismiss, recheckFcc };
}
