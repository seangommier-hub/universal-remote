// Detects a physical "bump" from accelerometer samples (ADR-HEARTH-130): one sharp spike well above
// resting gravity (1g), ignoring anything within the cooldown so one bump fires once.

const BUMP_THRESHOLD_G = 2.5;
const BUMP_COOLDOWN_MS = 2000;

export interface AccelerationSample {
  x: number;
  y: number;
  z: number;
}

/** Returns a function that takes each sample and calls onBump at most once per cooldown when a spike is seen. */
export function createBumpDetector(onBump: () => void, now: () => number = Date.now): (sample: AccelerationSample) => void {
  let lastBumpAt = -Infinity;
  return ({ x, y, z }) => {
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    if (magnitude < BUMP_THRESHOLD_G) return;
    const time = now();
    if (time - lastBumpAt < BUMP_COOLDOWN_MS) return;
    lastBumpAt = time;
    onBump();
  };
}
