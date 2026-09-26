import { Platform } from "react-native";
import { recordFccUnreachable } from "../core/network/fccOutage";
import type { StateStore } from "../core/state/StateStore";
import type { Device } from "../core/types/Device";
import { isDemoMode } from "./demoMode";

// ADR-HEARTH-172: demo-only ?offline=fcc | device, so the web harness can show each offline banner
// through the real detection code (real outage records, real tracker) with a shortened wait.

const OFFLINE_QUERY_PARAM = "offline";
const DEMO_OUTAGE_SETUP_DELAY_MS = 1200;
const DEMO_FCC_FIRST_FAILURE_AGO_MS = 5 * 60 * 1000 - 2000;
const DEMO_DEVICE_SILENT_MS = 5 * 60 * 1000;

export type DemoOfflineKind = "fcc" | "device";

let clockSkewMs = 0;

/** The demo-only ?offline= value, or null when absent, unknown, or not in demo mode. */
export function demoOfflineParam(): DemoOfflineKind | null {
  if (!isDemoMode() || Platform.OS !== "web" || typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(OFFLINE_QUERY_PARAM);
  return value === "fcc" || value === "device" ? value : null;
}

/** The clock the offline banner reads; in demo mode it can be moved forward so a 5 minute silence is visible at once. */
export function offlineClock(): number {
  return Date.now() + clockSkewMs;
}

function silenceFirstConnectedDevice(devices: readonly Device[], stateStore: StateStore): void {
  const connected = devices.find((device) => stateStore.get(device.id).connection === "connected");
  if (!connected) return;
  stateStore.set(connected.id, { connection: "disconnected", values: {}, lastUpdated: Date.now() });
  clockSkewMs += DEMO_DEVICE_SILENT_MS;
}

/** Starts the requested demo outage shortly after mount; returns a cleanup function. */
export function startDemoOutage(kind: DemoOfflineKind, devices: readonly Device[], stateStore: StateStore): () => void {
  const timer = setTimeout(() => {
    if (kind === "fcc") {
      recordFccUnreachable(Date.now() - DEMO_FCC_FIRST_FAILURE_AGO_MS);
      recordFccUnreachable(Date.now());
    } else {
      silenceFirstConnectedDevice(devices, stateStore);
    }
  }, DEMO_OUTAGE_SETUP_DELAY_MS);
  return () => clearTimeout(timer);
}
