import { logger } from "../../core/logging/logger";
import { HomeAssistantClient } from "./HomeAssistantClient";
import { HaInstance } from "./haInstance";

const LOG_SCOPE = "haUnitSystem";

// One temperature unit per server ("°C" or "°F", from /api/config unit_system.temperature). Climate temperatures in
// /api/states already arrive in this unit, so it is only needed to label them.
const unitsByInstance = new Map<string, string>();

/** The temperature unit already read for this server, or undefined before the first successful read. */
export function cachedTemperatureUnit(instanceId: string): string | undefined {
  return unitsByInstance.get(instanceId);
}

/** Reads (once) and returns the server's temperature unit; undefined when it cannot be read, so the UI shows a bare degree sign. */
export async function loadTemperatureUnit(instance: HaInstance, client: HomeAssistantClient): Promise<string | undefined> {
  const known = unitsByInstance.get(instance.id);
  if (known) return known;
  try {
    const unit = (await client.getConfig()).unit_system?.temperature;
    if (typeof unit === "string" && unit) unitsByInstance.set(instance.id, unit);
    return unitsByInstance.get(instance.id);
  } catch (error) {
    logger.warn(LOG_SCOPE, "could not read the Home Assistant unit system", { error: String(error) });
    return undefined;
  }
}

/** Test-only: forgets every cached unit. */
export function resetTemperatureUnitsForTests(): void {
  unitsByInstance.clear();
}
