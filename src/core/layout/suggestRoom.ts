import { roomKey } from "./deviceLayout";

/**
 * ADR-HEARTH-221: which room a just-added device most likely belongs in, taken from its own name --
 * "Living Room TV" -> "Living Room" -- the way Home Assistant offers an area when you add a device.
 * Picks the longest choice that appears as whole words in the name; undefined when none does.
 */
export function suggestRoom(deviceName: string, choices: readonly string[]): string | undefined {
  const words = ` ${roomKey(deviceName).replace(/[^a-z0-9]+/g, " ").trim()} `;
  let best: string | undefined;
  for (const choice of choices) {
    const key = ` ${roomKey(choice).replace(/[^a-z0-9]+/g, " ").trim()} `;
    if (key.trim().length === 0 || !words.includes(key)) continue;
    if (best === undefined || key.length > ` ${roomKey(best)} `.length) best = choice;
  }
  return best;
}
