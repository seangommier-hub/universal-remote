import { loadFamilyCommandCenterConfig } from "../../../discovery/familyCommandCenterConfig";
import { fccFetch, isFccTimeout } from "../../../core/network/fccRequest";

// ADR-HEARTH-192: the Family Command Center's Pi-side Alexa bridge (built by a sibling session
// against `alexa-remote2`, an unofficial Amazon API) is the only thing that ever talks to Amazon —
// Hearth's phone reaches it exactly the same way it already reaches SmartThings outlets
// (SmartThingsClient.ts): plain authenticated HTTP through the household's existing Family Command
// Center pairing, no separate Amazon credential held on the phone at all.

export const ALEXA_PLUGS_PATH = "/api/integrations/hearth/alexa/plugs";
// Same value and same justification as SmartThingsClient.ts's FCC_REQUEST_TIMEOUT_MS: consistent
// with every other FCC-bound call in this codebase (ADR-HEARTH-010/141).
const FCC_REQUEST_TIMEOUT_MS = 8000;
const ALEXA_NOT_LINKED_STATUS = 502;

export interface AlexaPlug {
  id: string;
  name: string;
  manufacturer: string;
  /** null means Amazon hasn't reported a state for this plug yet — distinct from a real "off" and must never be treated as one. */
  on: boolean | null;
  reachable: boolean;
}

/** Thrown for any non-2xx response from the alexa/plugs route. `status` 502 is the bridge's own
 * "Amazon isn't signed in yet" / "bridge is down" cases — a real, actionable, different problem
 * from an unreachable plug, not a generic failure (see describeAlexaBridgeFailure.ts). */
export class AlexaBridgeError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

/** True for the one AlexaBridgeError case that means "Amazon isn't linked yet, or the bridge process is down" rather than a normal offline plug. */
export function isAlexaNotLinkedError(error: unknown): error is AlexaBridgeError {
  return error instanceof AlexaBridgeError && error.status === ALEXA_NOT_LINKED_STATUS;
}

/** Thrown when Family Command Center isn't paired yet — Alexa plugs are reached entirely through it, so there's nothing to sync without it, the same as SmartThingsClient.ts's equivalent. */
export class FamilyCommandCenterNotConfiguredError extends Error {}

/** Reads the route's own `{"error": "..."}` body when present, so a 502's real, specific reason (not
 * signed in vs. bridge down) reaches the user verbatim instead of being collapsed into "Family
 * Command Center returned 502". Falls back to the generic status message when the body isn't JSON
 * or has no `error` field. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) return body.error;
  } catch {
    // Not JSON, or no usable `error` field — fall through to the generic message below.
  }
  return `Family Command Center returned ${response.status}`;
}

async function fccRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) {
    throw new FamilyCommandCenterNotConfiguredError("Family Command Center isn't paired yet — pair it first, then Alexa plugs can sync.");
  }

  let response: Response;
  try {
    response = await fccFetch(config, path, init, FCC_REQUEST_TIMEOUT_MS);
  } catch (err) {
    if (isFccTimeout(err)) {
      throw new AlexaBridgeError(`Family Command Center didn't respond within ${FCC_REQUEST_TIMEOUT_MS / 1000} seconds`, 0);
    }
    throw err;
  }
  if (!response.ok) {
    throw new AlexaBridgeError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as T;
}

/** Every plug the household's Amazon account currently reports through the Family Command Center's Alexa bridge. */
export async function listPlugs(): Promise<AlexaPlug[]> {
  const { plugs } = await fccRequest<{ plugs: AlexaPlug[] }>(ALEXA_PLUGS_PATH);
  return plugs;
}

export async function setPlugState(plugId: string, state: "on" | "off"): Promise<void> {
  await fccRequest(`${ALEXA_PLUGS_PATH}/${encodeURIComponent(plugId)}`, {
    method: "POST",
    body: JSON.stringify({ state }),
  });
}
