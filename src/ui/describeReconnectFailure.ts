import { classifyNetworkFailure } from "../core/network/classifyNetworkFailure";

const RETRY_SUFFIX = "Controls are off for now, still retrying automatically.";
const RAW_ERROR_SUFFIX = "controls are off for now, still retrying automatically.";

/** One-sentence reconnect-card text: a plain "what to check" when the network is the cause, else the raw last error (ADR-HEARTH-142). */
export function describeReconnectFailure(lastError: string): string {
  const diagnosis = classifyNetworkFailure(lastError);
  if (diagnosis.kind === "lan-blocked" || diagnosis.kind === "rejected-token") {
    return `${diagnosis.summary} ${RETRY_SUFFIX}`;
  }
  return `Last attempt: ${lastError} — ${RAW_ERROR_SUFFIX}`;
}
