// ADR-HEARTH-212: which installed app binaries actually contain the expo-sensors native module.
//
// Sean's iPhone runs the 1.1.0 binary (EAS build 157944ea, 2026-09-24) and still gets every JS
// update, because ship-update.sh publishes to both runtimes. Inspecting that .ipa directly showed
// no ExpoSensors/Accelerometer code at all (ExpoKeepAwake/ExpoLinking ARE present). Settings is the
// only screen that tries to load the motion sensor, and on that binary the app died the moment
// Settings mounted, too fast for even the first breadcrumb (ADR-HEARTH-207) to reach storage. The
// runtime version is known in JS without touching any native-module lookup, so it is the guard.

/** Runtime versions whose binaries were built without expo-sensors. */
const RUNTIMES_WITHOUT_MOTION_SENSOR: readonly string[] = ["1.1.0"];

/** False when this app binary is known to have no motion sensor module, so nothing should even look it up. */
export function binaryHasMotionSensor(runtimeVersion: string | null | undefined): boolean {
  return !runtimeVersion || !RUNTIMES_WITHOUT_MOTION_SENSOR.includes(runtimeVersion);
}
