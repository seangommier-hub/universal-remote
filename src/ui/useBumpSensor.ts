import { useEffect, useState } from "react";
import { AccelerationSample, createBumpDetector } from "../runtime/bumpDetector";

const SENSOR_INTERVAL_MS = 50;

interface AccelerometerModule {
  isAvailableAsync: () => Promise<boolean>;
  setUpdateInterval: (ms: number) => void;
  addListener: (listener: (sample: AccelerationSample) => void) => { remove: () => void };
}

// A build made before expo-sensors was added has no native motion module, and importing it there
// throws — so it is loaded lazily and any failure just means "no motion bump on this build"
// (the on-screen Bump button still works). Returns whether motion detection is active.
function loadAccelerometer(): AccelerometerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("expo-sensors") as { Accelerometer: AccelerometerModule }).Accelerometer;
  } catch {
    return null;
  }
}

/** Calls onBump when the phone is physically bumped, on builds that include the motion sensor module. */
export function useBumpSensor(enabled: boolean, onBump: () => void): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const accelerometer = loadAccelerometer();
    if (!accelerometer) return;
    let subscription: { remove: () => void } | undefined;
    let cancelled = false;
    accelerometer
      .isAvailableAsync()
      .then((ok) => {
        if (!ok || cancelled) return;
        setAvailable(true);
        accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
        subscription = accelerometer.addListener(createBumpDetector(onBump));
      })
      .catch(() => setAvailable(false));
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, onBump]);

  return available;
}
