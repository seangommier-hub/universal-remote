import { DISCOVER_ALL_PATH } from "../discovery/discoverAll";
import { ACTIVITY_LOG_PATH } from "../discovery/familyCommandCenterActivityLog";
import { ALEXA_PLUGS_PATH } from "../drivers/outlet/alexa/AlexaPlugClient";
import { demoActivityLogBody } from "./demoActivityLog";
import { demoAlexaPlugsBody } from "./demoAlexaPlugs";
import { demoDiscoverAllBody } from "./demoDiscoverPayload";
import { demoGuestInviteBody, demoHouseholdPhonesBody, demoOwnIdentity } from "./demoHouseholdPhones";
import { demoHouseholdRemotesBody, demoRemoteButtonMapBody, demoRemotePairingCodeBody } from "./demoHouseholdRemotes";

const PHONE_TOKENS_SELF_PATH = "/api/integrations/hearth/phone-tokens/self";
const PHONE_TOKENS_PATH = "/api/integrations/hearth/phone-tokens";
const PAIR_CODE_PATH = "/api/integrations/hearth/pair/code";
const PHYSICAL_REMOTE_PAIR_PATH = "/api/integrations/hearth/physical-remote/pair";
const PHYSICAL_REMOTE_MAPPING_PATH = "/api/integrations/hearth/physical-remote/mapping";
const PHYSICAL_REMOTE_PATH = "/api/integrations/hearth/physical-remote";

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
  // Checked before PHONE_TOKENS_PATH, which is a substring of this one.
  if (url.includes(PHONE_TOKENS_SELF_PATH)) return jsonResponse(demoOwnIdentity(), HTTP_OK);
  if (url.includes(PHONE_TOKENS_PATH)) return jsonResponse(demoHouseholdPhonesBody(), HTTP_OK);
  if (url.includes(PAIR_CODE_PATH)) return jsonResponse(demoGuestInviteBody(), HTTP_OK);
  // Checked before PHYSICAL_REMOTE_PATH, which is a substring of both of these.
  if (url.includes(PHYSICAL_REMOTE_PAIR_PATH)) return jsonResponse(demoRemotePairingCodeBody(), HTTP_OK);
  if (url.includes(PHYSICAL_REMOTE_MAPPING_PATH)) return jsonResponse(demoRemoteButtonMapBody(), HTTP_OK);
  if (url.includes(PHYSICAL_REMOTE_PATH)) return jsonResponse(demoHouseholdRemotesBody(), HTTP_OK);
  if (url.includes(ALEXA_PLUGS_PATH)) return jsonResponse(demoAlexaPlugsBody(), HTTP_OK);
  return jsonResponse({ error: "not available in demo mode" }, HTTP_NOT_FOUND);
}

/** Replaces the global fetch with demoFetch; only ever called from demo startup. */
export function installDemoFetch(): void {
  globalThis.fetch = demoFetch as typeof fetch;
}
