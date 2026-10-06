import * as Updates from "expo-updates";
import { useEffect, useRef, useState } from "react";
import { AccelerometerModule, startBumpSubscription } from "../runtime/bumpSubscription";
import { binaryHasMotionSensor } from "../runtime/motionSensorSupport";
import { markSettingsVisitStage } from "../runtime/settingsVisitBreadcrumb";

// A build made before expo-sensors was added has no native motion module. The try/catch below was
// meant to make that harmless, but on the real 1.1.0 iPhone binary the app died the instant
// Settings mounted (ADR-HEARTH-212), so a binary known to lack the module never looks it up at all.
// Either way the on-screen Bump button still works. Returns whether motion detection is active.
function loadAccelerometer(): AccelerometerModule | null {
  if (!binaryHasMotionSensor(Updates.runtimeVersion)) return null;
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
  const onBumpRef = useRef(onBump);
  onBumpRef.current = onBump;

  useEffect(() => {
    if (!enabled) return;
    const accelerometer = loadAccelerometer();
    if (!accelerometer) return;
    return startBumpSubscription(accelerometer, {
      getOnBump: () => onBumpRef.current,
      onAvailable: () => setAvailable(true),
      // ADR-HEARTH-207: breadcrumbs around the one native call unique to the settings screen.
      onStarting: () => void markSettingsVisitStage("motion-sensor-starting"),
      onRunning: () => void markSettingsVisitStage("motion-sensor-running"),
    });
  }, [enabled]);

  return available;
}
