import { loadFamilyCommandCenterConfig } from "../../discovery/familyCommandCenterConfig";
import { FccNotConfiguredError, FccTokenRejectedError, FccUnreachableError } from "./fccErrors";

// See ADR-HEARTH-011. A device may sit on a network segment the phone isn't currently joined
// to (e.g. an isolated Guest/IoT/kids-AP network) — direct connection then fails not because
// the device or protocol is broken, but because the phone simply can't route there. This tries
// direct first (fast, works with zero Family Command Center dependency) and only falls back to
// relaying the request through Family Command Center's backend, which has broader network
// reach, when direct connection fails.

// Real latency finding (2026-09-20): a device on a segment the phone can't reach directly (e.g.
// an isolated Guest/IoT/kids-AP network) fails the *direct* leg on literally every single command,
// forever — paying the full DIRECT_TIMEOUT_MS penalty each time even though the outcome was
// already established the very first time this session. A household member driving an on-screen
// remote through several rapid button presses felt this as severe per-button lag (Sean, directly:
// "there is sever[e] latency"). Remembered only for the lifetime of this app session (a plain
// in-memory Set, not persisted) — once direct has failed once for a given ip:port, later calls to
// that same address skip straight to the relay leg. Resets on app restart rather than being
// permanent, so a device that later moves back onto the main LAN isn't stuck paying a relay
// round-trip forever for no reason.
const knownRelayOnly = new Set<string>();

function relayKey(ip: string, port: number): string {
  return `${ip}:${port}`;
}

/** Test-only: clears the "this address needs relay" memory between test cases. Never called from real app code — the whole point is that this persists for the app's actual lifetime. */
export function resetRelayNecessityCacheForTests(): void {
  knownRelayOnly.clear();
}

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
const HTTP_UNAUTHORIZED = 401;
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

// Real ask (2026-09-21, ADR-HEARTH-123): "this should be something that can still be used even
// when off network." Distinguishes "couldn't reach Family Command Center at all" (worth retrying
// against the public tunnel, if one's configured) from "Family Command Center was reached and
// explicitly rejected the request" (a real error — wrong token, malformed request, a device it
// doesn't recognize — retrying elsewhere would only mask it, not fix it). Only the former ever
// triggers the public-URL fallback below.


async function callRelayAt(baseUrl: string, token: string, request: RelayableRequest): Promise<RelayableResponse> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${baseUrl}${RELAY_PATH}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      throw new FccUnreachableError(`Family Command Center didn't respond within ${RELAY_TIMEOUT_MS / 1000} seconds while relaying to ${request.ip}:${request.port} — try again`);
    }
    throw new FccUnreachableError(err instanceof Error ? err.message : String(err));
  }

  if (response.status === HTTP_UNAUTHORIZED) {
    throw new FccTokenRejectedError("Family Command Center rejected the saved token.");
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

async function callRelay(request: RelayableRequest): Promise<RelayableResponse> {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) {
    throw new FccNotConfiguredError(
      `Could not reach ${request.ip} directly, and Family Command Center isn't configured for relay fallback (add it in Settings)`
    );
  }

  try {
    return await callRelayAt(config.baseUrl, config.token, request);
  } catch (err) {
    // Only a genuine "couldn't reach it at all" failure falls through to the public tunnel — and
    // only when one's actually configured (Settings screen, optional). Away from the home WiFi,
    // the LAN baseUrl fails fast (nothing there to answer), so this adds one real network attempt,
    // not a silent hang.
    if (!(err instanceof FccUnreachableError) || !config.publicBaseUrl) throw err;
    return await callRelayAt(config.publicBaseUrl, config.token, request);
  }
}

/** Tries a direct HTTP request first; falls back to relaying through Family Command Center if that fails. Skips the direct attempt entirely once this address has already proven direct-unreachable this session (see knownRelayOnly above). */
export async function requestWithRelayFallback(request: RelayableRequest): Promise<RelayableResponse> {
  const key = relayKey(request.ip, request.port);
  if (knownRelayOnly.has(key)) {
    return callRelay(request);
  }
  const directUrl = `http://${request.ip}:${request.port}${request.path}`;
  try {
    return await fetchWithTimeout(directUrl, { method: request.method, headers: request.headers, body: request.body }, DIRECT_TIMEOUT_MS);
  } catch {
    knownRelayOnly.add(key);
    return callRelay(request);
  }
}
