import { describePairingFailure, PairingFailureCopy } from "../../../discovery/pairingCopy";
import { isAlexaNotLinkedError } from "./AlexaPlugClient";

/**
 * A 502 from the Alexa bridge route is a real, actionable, different problem from a normal offline
 * plug — Amazon isn't signed in yet on the Family Command Center, or the bridge process itself is
 * down — and Sean may be doing that one-time sign-in right now. Surfacing Family Command Center's
 * own `error` message verbatim (already read out by AlexaPlugClient.ts's readErrorMessage) keeps
 * that distinction; running it through describePairingFailure's generic network-failure classifier
 * would risk reclassifying it as "can't reach the device" and prompting a plain retry as if it were
 * a transient network blip, which it isn't.
 */
export function describeAlexaBridgeFailure(brandLabel: string, error: unknown): PairingFailureCopy {
  if (isAlexaNotLinkedError(error)) {
    return { kind: "unknown", title: "Amazon isn't linked yet", message: error.message, diagnosis: null };
  }
  return describePairingFailure("alexa", brandLabel, error);
}
