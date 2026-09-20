import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";

// See ADR-HEARTH-011. A device may sit on a network segment the phone isn't currently joined
// to (e.g. an isolated Guest/IoT/kids-AP network) — direct connection then fails not because
// the device or protocol is broken, but because the phone simply can't route there. This tries
// direct first (fast, works with zero Family Command Center dependency) and only falls back to
// relaying the request through Family Command Center's backend, which has broader network
// reach, when direct connection fails.

const DIRECT_TIMEOUT_MS = 4000;
// Real-hardware-pattern finding (2026-09-12): every other network call in this codebase times
// out and surfaces a retry-able error instead of hanging (FamilyCommandCenterDiscoveryProvider's
// SCAN_TIMEOUT_MS, wsRelayFallback's RELAY_CONNECT_TIMEOUT_MS) -- this relay leg was the one
// exception. callRelay() called fetch() directly with no timeout at all, so a slow/hung Family
// Command Center (or a device on the other end of its relay hanging) left Sony/Roku/Hue's
// connect-or-command calls stuck forever with no error, indistinguishable from the app being
// broken -- exactly the same failure mode ADR-HEARTH-010's discovery-scan fix already addressed,
// just missed here since this relay leg predates that fix. Matches wsRelayFallback's own relay
// timeout value for consistency between the HTTP and WebSocket relay paths.
const RELAY_TIMEOUT_MS = 8000;
const RELAY_PATH = "/api/integrations/hearth/relay/http";

export interface RelayableRequest {
  ip: string;
  port: number;
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface RelayableResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

interface RelayHttpResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Real bug found live (2026-09-20): a device on a segment the phone can't reach directly (e.g. an
// isolated Guest/IoT/kids-AP network, see this file's own top comment) means the *direct* leg
// reliably times out on every single command, so a household member driving the on-screen remote
// (no physical remote available) ends up tapping several buttons in quick succession while each
// one is still working through that direct-timeout-then-relay-fallback delay. Under that load,
// iOS's own native networking layer can cancel an in-flight relay request out from under this
// code -- and that cancellation does NOT always surface as `err.name === "AbortError"` the way our
// own deliberate `controller.abort()` timeout does; on iOS/Expo it can come back as a raw,
// unreadable native exception (seen live: "fetch request has been canceled" from
// Expo/NativeResponse.swift) that isn't caught by the name check below and was re-thrown as-is,
// reaching the UI as that same ugly native string. Any message containing "cancel" is now treated
// the same as a real AbortError -- one retry-able, human-readable message regardless of which
// native shape the cancellation actually took.
function isCancellation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  return /cancel/i.test(err.message);
}

async function callRelay(request: RelayableRequest): Promise<RelayableResponse> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) {
    throw new Error(
      `Could not reach ${request.ip} directly, and Family Command Center isn't configured for relay fallback (add it in Settings)`
    );
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${config.baseUrl}${RELAY_PATH}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
        body: JSON.stringify({
          targetIp: request.ip,
          targetPort: request.port,
          path: request.path,
          method: request.method,
          headers: request.headers,
          body: request.body,
        }),
      },
      RELAY_TIMEOUT_MS
    );
  } catch (err) {
    if (isCancellation(err)) {
      throw new Error(`Family Command Center didn't respond within ${RELAY_TIMEOUT_MS / 1000} seconds while relaying to ${request.ip}:${request.port} — try again`);
    }
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Family Command Center rejected the relay request: HTTP ${response.status}`);
  }

  const result = (await response.json()) as RelayHttpResult;
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    json: async () => JSON.parse(result.body),
    text: async () => result.body,
  };
}

/** Tries a direct HTTP request first; falls back to relaying through Family Command Center if that fails. */
export async function requestWithRelayFallback(request: RelayableRequest): Promise<RelayableResponse> {
  const directUrl = `http://${request.ip}:${request.port}${request.path}`;
  try {
    return await fetchWithTimeout(directUrl, { method: request.method, headers: request.headers, body: request.body }, DIRECT_TIMEOUT_MS);
  } catch {
    return callRelay(request);
  }
}
