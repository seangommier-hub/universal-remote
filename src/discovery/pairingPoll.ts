import { PairingRunContext } from "./pairingSession";

// ADR-HEARTH-155: the one status-polling loop for the Apple TV and PS5 pairing steps (they each had
// a private copy). It checks first, sleeps through the session's cancellable sleep, and stops the
// moment the session is cancelled.

export class PairingPollCancelledError extends Error {}
export class PairingPollTimedOutError extends Error {}

export interface PairingPollOptions<S extends string> {
  fetchStatus: () => Promise<{ status: S | "error"; errorMessage?: string }>;
  target: S;
  intervalMs: number;
  maxAttempts: number;
  context: PairingRunContext;
  /** Message when the driver-side pairing reports an error without text. */
  fallbackErrorMessage: string;
}

/** Polls until `target` is reported, throwing on a reported error, a timeout or cancellation. */
export async function pollPairingStatus<S extends string>(options: PairingPollOptions<S>): Promise<void> {
  const { fetchStatus, target, intervalMs, maxAttempts, context, fallbackErrorMessage } = options;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (context.isCancelled()) throw new PairingPollCancelledError("Pairing cancelled.");
    const status = await fetchStatus();
    if (status.status === target) return;
    if (status.status === "error") throw new Error(status.errorMessage || fallbackErrorMessage);
    await context.sleep(intervalMs);
  }
  if (context.isCancelled()) throw new PairingPollCancelledError("Pairing cancelled.");
  throw new PairingPollTimedOutError("Timed out waiting for that step to finish.");
}
