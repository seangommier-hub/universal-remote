import { withTimeout } from "../util/withTimeout";

/** Default ceiling for a single request to Family Command Center or a LAN device. */
export const DEFAULT_FETCH_TIMEOUT_MS = 8000;
/** Ceiling for requests that legitimately drive a slow subprocess on the far side (pairing handshakes). */
export const LONG_FETCH_TIMEOUT_MS = 30000;

const MS_PER_SECOND = 1000;

/** Thrown when a request exceeds its time budget, as opposed to the caller cancelling it. */
export class FetchTimeoutError extends Error {
  constructor(readonly host: string, readonly timeoutMs: number) {
    super(`Request to ${host} timed out after ${timeoutMs / MS_PER_SECOND} seconds`);
    this.name = "FetchTimeoutError";
  }
}

function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1] : url;
}

/** fetch() that always settles: rejects with FetchTimeoutError (and aborts the request) if no response arrives in time; a caller-supplied signal still cancels it. */
export function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const onCallerAbort = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  callerSignal?.addEventListener("abort", onCallerAbort);

  const request = fetch(url, { ...init, signal: controller.signal });
  return withTimeout(
    request,
    timeoutMs,
    () => new FetchTimeoutError(hostOf(url), timeoutMs),
    () => controller.abort(),
    () => callerSignal?.removeEventListener("abort", onCallerAbort)
  );
}
