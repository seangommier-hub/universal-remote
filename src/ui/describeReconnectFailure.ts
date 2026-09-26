import { classifyNetworkFailure } from "../core/network/classifyNetworkFailure";

const RETRY_SUFFIX = "Controls are off for now, still retrying automatically.";
const RAW_ERROR_SUFFIX = "controls are off for now, still retrying automatically.";
const FAMILY_COMMAND_CENTER = "family command center";

/**
 * One-sentence reconnect-card text (ADR-HEARTH-142). The card describes ONE device, and a device that
 * is simply switched off fails in exactly the same way a blocked home network does (a timeout or
 * refusal to a home address), so a network diagnosis is only used when the error itself names Family
 * Command Center or the saved token; anything else keeps the raw last error rather than sending
 * someone to iCloud Private Relay because a TV is off.
 */
export function describeReconnectFailure(lastError: string): string {
  const diagnosis = classifyNetworkFailure(lastError);
  const namesFamilyCommandCenter = lastError.toLowerCase().includes(FAMILY_COMMAND_CENTER);
  const useDiagnosis = diagnosis.kind === "rejected-token" || (diagnosis.kind === "lan-blocked" && namesFamilyCommandCenter);
  if (useDiagnosis) {
    return `${diagnosis.summary} ${RETRY_SUFFIX}`;
  }
  return `Last attempt: ${lastError} — ${RAW_ERROR_SUFFIX}`;
}
