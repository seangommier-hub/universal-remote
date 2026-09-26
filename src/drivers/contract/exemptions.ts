// Per-driver exemptions from the connection contract. An entry is either:
//   "by-design" - the driver deliberately differs (documented in an ADR); the case is reported as
//                 skipped with the reason in its name, so it can never disappear silently.
//   "bug"       - a REAL defect the contract found; the case runs under test.failing, so the suite
//                 stays green now and turns red the moment the bug is fixed (delete the entry then).
// Every "bug" entry cites its number in ADR-HEARTH-145's bug list.

export type ContractCaseId =
  | "connectHangRejects"
  | "connectRefuseRejects"
  | "retryAfterFailure"
  | "disconnectCancelsRetries"
  | "disconnectDuringInflightConnect"
  | "connectDedupe"
  | "commandWhileHungRejects"
  | "commandFailureMarksDisconnected"
  | "subscribeNotifies"
  | "socketDropReconnects"
  | "silentDeathDetected";

export interface Exemption {
  kind: "by-design" | "bug";
  reason: string;
  /** Number in ADR-HEARTH-145's real-bug list; required when kind is "bug". */
  bug?: number;
}

export type DriverExemptions = Partial<Record<ContractCaseId, Exemption>>;

const NO_PROBE_CONNECT =
  "connect() performs no network I/O by design: it only validates saved config, so there is nothing to time out, reject or retry (ADR-HEARTH-064/099/103)";
const NO_PROBE_STATE =
  "the driver's connection state is a config claim, not a reachability claim, so a failed send deliberately leaves it alone (ADR-HEARTH-064/099/103)";

/** Xbox and PS5 are deliberately never probed, so a console is never woken by a reachability check. Broadlink shares the "nothing to verify" connect. */
export const NO_PROBE_DRIVER_EXEMPTIONS: DriverExemptions = {
  connectHangRejects: { kind: "by-design", reason: NO_PROBE_CONNECT },
  connectRefuseRejects: { kind: "by-design", reason: NO_PROBE_CONNECT },
  retryAfterFailure: { kind: "by-design", reason: NO_PROBE_CONNECT },
  commandFailureMarksDisconnected: { kind: "by-design", reason: NO_PROBE_STATE },
};

/** Hue and the squirrel feeder are stateless per-request HTTP: ADR-HEARTH-032 and ADR-HEARTH-104 record that they have no reconnect-backoff machinery. */
export const STATELESS_HTTP_RETRY_EXEMPTION: Exemption = {
  kind: "by-design",
  reason: "stateless per-request HTTP with no reconnect-backoff machinery; the next command simply tries again (ADR-HEARTH-032, ADR-HEARTH-104)",
};

export const SAMSUNG_NO_LIVENESS: Exemption = {
  kind: "by-design",
  reason: "ADR-HEARTH-143: no documented request/reply exists to probe Samsung liveness, and sendKey is fire-and-forget, so a dead socket accepts the key and reports success",
};

export const LG_COMMAND_TIMEOUT_NOT_LIVENESS: Exemption = {
  kind: "by-design",
  reason: "a persistent socket's health is owned by onclose plus the ADR-HEARTH-132 heartbeat (see silentDeathDetected), not by one command timing out",
};
