import { DISCOVER_ALL_PATH } from "../discovery/discoverAll";
import { ACTIVITY_LOG_PATH } from "../discovery/familyCommandCenterActivityLog";
import { demoActivityLogBody } from "./demoActivityLog";
import { demoDiscoverAllBody } from "./demoDiscoverPayload";

export const DEMO_FCC_BASE_URL = "http://demo-fcc.invalid:3211";
export const DEMO_FCC_TOKEN = "demo-token";
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Answers a demo request: the discover-all fixture for that endpoint, 404 for other demo-host paths, and a network error for anything else so demo mode can never reach a real host. */
export async function demoFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.startsWith(DEMO_FCC_BASE_URL)) throw new TypeError("Demo mode: network access is disabled");
  if (url.endsWith(DISCOVER_ALL_PATH)) return jsonResponse(demoDiscoverAllBody(), HTTP_OK);
  if (url.includes(ACTIVITY_LOG_PATH)) return jsonResponse(demoActivityLogBody(), HTTP_OK);
  return jsonResponse({ error: "not available in demo mode" }, HTTP_NOT_FOUND);
}

/** Replaces the global fetch with demoFetch; only ever called from demo startup. */
export function installDemoFetch(): void {
  globalThis.fetch = demoFetch as typeof fetch;
}
