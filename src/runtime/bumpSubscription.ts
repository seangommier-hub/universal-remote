import { AccelerationSample, createBumpDetector } from "./bumpDetector";

// ADR-HEARTH-207: the accelerometer is started ONCE per mount and always calls the latest onBump
// through a getter. Before this, the hook's effect depended on onBump, which changes identity on every
// App render (App.tsx's handleDeviceAdded is a plain function), so each render stopped and restarted
// the native CMMotionManager while its background queue was still delivering samples.

const SENSOR_INTERVAL_MS = 50;

export interface AccelerometerModule {
  isAvailableAsync: () => Promise<boolean>;
  setUpdateInterval: (ms: number) => void;
  addListener: (listener: (sample: AccelerationSample) => void) => { remove: () => void };
}

export interface BumpSubscriptionCallbacks {
  /** Always returns the current bump handler, so a new handler never needs a new native subscription. */
  getOnBump: () => () => void;
  onAvailable: () => void;
  onStarting?: () => void;
  onRunning?: () => void;
}

/** Starts listening for physical bumps if the sensor is available; returns a function that stops it. */
export function startBumpSubscription(accelerometer: AccelerometerModule, callbacks: BumpSubscriptionCallbacks): () => void {
  let subscription: { remove: () => void } | undefined;
  let cancelled = false;
  accelerometer
    .isAvailableAsync()
    .then((ok) => {
      if (!ok || cancelled) return;
      callbacks.onStarting?.();
      accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
      subscription = accelerometer.addListener(createBumpDetector(() => callbacks.getOnBump()()));
      callbacks.onAvailable();
      callbacks.onRunning?.();
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
    subscription?.remove();
    subscription = undefined;
  };
}
