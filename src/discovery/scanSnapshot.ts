import { NetworkDevice } from "./discoverAll";

// ADR-HEARTH-222: the newest completed network scan, shared so the "new devices found" indicator
// can read what the Suggested / Discover screens already scanned instead of running a second
// scanner. It also counts scans in flight, so the indicator never starts one on top of a running one.

const PASSIVE_RESCAN_MINUTES = 10;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
export const PASSIVE_RESCAN_MIN_INTERVAL_MS = PASSIVE_RESCAN_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

export interface ScanSnapshot {
  devices: NetworkDevice[];
  scannedAt: number;
}

type Listener = (snapshot: ScanSnapshot) => void;

let latest: ScanSnapshot | null = null;
let scansInFlight = 0;
const listeners = new Set<Listener>();

/** Records a completed, successful scan and tells every subscriber. */
export function publishScan(devices: NetworkDevice[], scannedAt: number = Date.now()): void {
  const snapshot: ScanSnapshot = { devices, scannedAt };
  latest = snapshot;
  listeners.forEach((listener) => listener(snapshot));
}

/** The newest completed scan, or null before any scan has finished. */
export function getScanSnapshot(): ScanSnapshot | null {
  return latest;
}

/** Calls the listener after every published scan; returns the function that stops it. */
export function subscribeToScans(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Runs a scan while counting it as in flight, whether it succeeds or throws. */
export async function trackScan<T>(run: () => Promise<T>): Promise<T> {
  scansInFlight += 1;
  try {
    return await run();
  } finally {
    scansInFlight -= 1;
  }
}

/** True while any scan is running. */
export function isScanRunning(): boolean {
  return scansInFlight > 0;
}

export interface PassiveScanInput {
  snapshot: ScanSnapshot | null;
  scanRunning: boolean;
  now: number;
  minIntervalMs?: number;
}

/** Whether the indicator may start its own quiet scan: nothing running and the last result is old (or missing). */
export function shouldPassiveScan(input: PassiveScanInput): boolean {
  if (input.scanRunning) return false;
  if (input.snapshot === null) return true;
  return input.now - input.snapshot.scannedAt >= (input.minIntervalMs ?? PASSIVE_RESCAN_MIN_INTERVAL_MS);
}

/** Test helper: forgets the snapshot, subscribers and in-flight count. */
export function resetScanSnapshotForTests(): void {
  latest = null;
  scansInFlight = 0;
  listeners.clear();
}
