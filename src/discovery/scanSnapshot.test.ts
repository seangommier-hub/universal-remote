import { NetworkDevice } from "./discoverAll";
import {
  getScanSnapshot,
  isScanRunning,
  PASSIVE_RESCAN_MIN_INTERVAL_MS,
  publishScan,
  resetScanSnapshotForTests,
  shouldPassiveScan,
  subscribeToScans,
  trackScan,
} from "./scanSnapshot";

const NOW = 1_000_000_000;
const device = { id: "n1", ip: "192.168.1.5" } as NetworkDevice;

beforeEach(resetScanSnapshotForTests);

describe("scan snapshot", () => {
  test("is empty until a scan is published, then holds the newest one", () => {
    expect(getScanSnapshot()).toBeNull();
    publishScan([device], NOW);
    publishScan([], NOW + 1);
    expect(getScanSnapshot()).toEqual({ devices: [], scannedAt: NOW + 1 });
  });

  test("tells subscribers about each published scan until they unsubscribe", () => {
    const heard: number[] = [];
    const stop = subscribeToScans((snapshot) => heard.push(snapshot.devices.length));
    publishScan([device], NOW);
    stop();
    publishScan([device, device], NOW + 1);
    expect(heard).toEqual([1]);
  });
});

describe("trackScan", () => {
  test("counts a scan as running until it finishes", async () => {
    let finish: () => void = () => undefined;
    const running = trackScan(() => new Promise<void>((resolve) => (finish = resolve)));
    expect(isScanRunning()).toBe(true);
    finish();
    await running;
    expect(isScanRunning()).toBe(false);
  });

  test("a scan that throws is no longer counted as running", async () => {
    await expect(trackScan(() => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    expect(isScanRunning()).toBe(false);
  });

  test("overlapping scans keep the count up until the last one ends", async () => {
    let finishFirst: () => void = () => undefined;
    const first = trackScan(() => new Promise<void>((resolve) => (finishFirst = resolve)));
    await trackScan(async () => undefined);
    expect(isScanRunning()).toBe(true);
    finishFirst();
    await first;
    expect(isScanRunning()).toBe(false);
  });
});

describe("shouldPassiveScan", () => {
  const fresh = { devices: [], scannedAt: NOW };

  test("scans when nothing has been scanned yet", () => {
    expect(shouldPassiveScan({ snapshot: null, scanRunning: false, now: NOW })).toBe(true);
  });

  test("never starts on top of a running scan", () => {
    expect(shouldPassiveScan({ snapshot: null, scanRunning: true, now: NOW })).toBe(false);
  });

  test("waits while the last scan is newer than the minimum interval", () => {
    expect(shouldPassiveScan({ snapshot: fresh, scanRunning: false, now: NOW + PASSIVE_RESCAN_MIN_INTERVAL_MS - 1 })).toBe(false);
  });

  test("scans once the last scan is old enough", () => {
    expect(shouldPassiveScan({ snapshot: fresh, scanRunning: false, now: NOW + PASSIVE_RESCAN_MIN_INTERVAL_MS })).toBe(true);
  });

  test("the default interval is ten minutes", () => {
    expect(PASSIVE_RESCAN_MIN_INTERVAL_MS).toBe(600_000);
  });
});
