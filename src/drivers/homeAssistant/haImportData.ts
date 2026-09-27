import { logger } from "../../core/logging/logger";
import { HomeAssistantClient, HomeAssistantEntity } from "./HomeAssistantClient";
import { HaRegistrySnapshot, fetchHaRegistries } from "./haRegistries";
import { HaSession } from "./haSession";
import { HaSocketFactory } from "./haSocket";

const LOG_SCOPE = "haImportData";
export const HA_REGISTRY_WAIT_MS = 8000;

export interface HaImportData {
  states: HomeAssistantEntity[];
  /** null when the WebSocket registries could not be read; the list is then offered without areas. */
  registries: HaRegistrySnapshot | null;
}

function waitUntilLive(session: HaSession, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Home Assistant did not open a live connection in time")), timeoutMs);
    const unsubscribe = session.onStatus((status) => {
      if (status === "live") finish();
      else if (status === "auth-failed") finish(new Error("Home Assistant rejected the access token"));
    });
    function finish(error?: Error): void {
      clearTimeout(timer);
      unsubscribe();
      if (error) reject(error);
      else resolve();
    }
    if (session.getStatus() === "live") finish();
  });
}

/** Opens a short-lived session to read the area, device and entity registries; null when that cannot be done. */
export async function readRegistriesOnce(baseUrl: string, token: string, createSocket?: HaSocketFactory, waitMs: number = HA_REGISTRY_WAIT_MS): Promise<HaRegistrySnapshot | null> {
  const session = new HaSession({ baseUrl, token, createSocket });
  try {
    session.start();
    await waitUntilLive(session, waitMs);
    return await fetchHaRegistries(session);
  } catch (error) {
    logger.warn(LOG_SCOPE, "could not read Home Assistant registries, continuing without areas", { error: String(error) });
    return null;
  } finally {
    session.stop();
  }
}

/** Everything the import screen needs: the REST state list (which also proves the token works) and, if reachable, the registries. */
export async function loadImportData(baseUrl: string, token: string, createSocket?: HaSocketFactory): Promise<HaImportData> {
  const states = await new HomeAssistantClient({ baseUrl, token }).getStates();
  const registries = await readRegistriesOnce(baseUrl, token, createSocket);
  return { states, registries };
}
