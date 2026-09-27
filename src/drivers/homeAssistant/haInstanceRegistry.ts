import { HaInstance, instanceIdFor } from "./haInstance";
import { normalizeHomeAssistantUrl } from "./HomeAssistantClient";

// In-memory table of known instances, keyed by normalized base URL. Persistence lives in haInstanceStore.ts.
const instances = new Map<string, HaInstance>();
const changeListeners = new Set<(instance: HaInstance) => void>();

/** Adds the server, or updates its token when the address is already known; returns the shared record. */
export function registerHaInstance(baseUrl: string, token: string): HaInstance {
  const normalized = normalizeHomeAssistantUrl(baseUrl);
  const cleanToken = token.trim();
  const existing = instances.get(normalized);
  if (existing && existing.token === cleanToken) return existing;
  const instance: HaInstance = { id: instanceIdFor(normalized), baseUrl: normalized, token: cleanToken };
  instances.set(normalized, instance);
  if (existing) changeListeners.forEach((listener) => listener(instance));
  return instance;
}

/** The instance with this id, or undefined when Hearth has never been given its credential on this phone. */
export function getHaInstance(instanceId: string): HaInstance | undefined {
  return Array.from(instances.values()).find((instance) => instance.id === instanceId);
}

/** The instance for a typed or stored address, or undefined. */
export function findHaInstanceByUrl(baseUrl: string): HaInstance | undefined {
  return instances.get(normalizeHomeAssistantUrl(baseUrl));
}

/** Every known instance. */
export function listHaInstances(): HaInstance[] {
  return Array.from(instances.values());
}

/** Calls back when a known instance's credential is replaced (so its live session can reconnect with the new token). */
export function onHaInstanceTokenChanged(listener: (instance: HaInstance) => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/** Test-only: forgets every instance and listener. */
export function resetHaInstancesForTests(): void {
  instances.clear();
  changeListeners.clear();
}
