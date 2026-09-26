import { classifyNetworkFailure, NetworkFailureDiagnosis } from "../core/network/classifyNetworkFailure";
import { PairCodeInvalidError, PairLockedOutError } from "../discovery/pairClient";
import { PairResponseRejectedError } from "../discovery/redeemResponse";

export const WRONG_CODE_MESSAGE = "That code didn't work. It may be wrong, expired or already used - ask for a new invite.";
export const LOCKED_OUT_MESSAGE = "Too many tries, wait 10 minutes and try again.";

export const UNTRUSTED_SERVER_MESSAGE = "That server gave an answer Hearth doesn't trust, so nothing was changed. Ask for a new invite from your own household.";

export interface PairFailureNotice {
  /** Plain message for code problems; null when the network notice should be shown instead. */
  message: string | null;
  diagnosis: NetworkFailureDiagnosis | null;
}

/** Turns a join failure into a plain code message or the network-failure diagnosis. */
export function describePairFailure(error: unknown): PairFailureNotice {
  if (error instanceof PairCodeInvalidError) return { message: WRONG_CODE_MESSAGE, diagnosis: null };
  if (error instanceof PairLockedOutError) return { message: LOCKED_OUT_MESSAGE, diagnosis: null };
  if (error instanceof PairResponseRejectedError) return { message: UNTRUSTED_SERVER_MESSAGE, diagnosis: null };
  const diagnosis = classifyNetworkFailure(error);
  if (diagnosis.kind === "unknown") return { message: diagnosis.message, diagnosis: null };
  return { message: null, diagnosis };
}
