import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";
import { fccFetch } from "./fccRequest";
import { DEFAULT_FETCH_TIMEOUT_MS } from "./fetchWithTimeout";

const HTTP_UNAUTHORIZED = 401;

/** Calls a Family Command Center JSON route (LAN then public tunnel) and returns the parsed body; throws a plain Error for a missing config or any non-OK status. */
export async function fccJsonRequest<T>(path: string, init?: RequestInit, timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS): Promise<T> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) {
    throw new Error("Family Command Center isn't connected — add its address and token in Settings first.");
  }
  const response = await fccFetch(config, path, init, timeoutMs);
  if (!response.ok) {
    throw new Error(response.status === HTTP_UNAUTHORIZED ? "Family Command Center rejected the saved token." : `Family Command Center returned ${response.status}.`);
  }
  return response.json();
}
