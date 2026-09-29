import { fccFetch } from "../core/network/fccRequest";
import { loadFamilyCommandCenterConfig } from "./familyCommandCenterConfig";

// Client for the Hearth physical-remote admin/pairing/mapping routes (ADR-HEARTH-201, Pi adr/0250):
// the "Household Remotes" settings screen (list, rename, revoke, pair) and the per-remote "Edit
// buttons" screen. Same LAN-then-public client every other FCC call uses. A physical remote's own
// token is never held or sent by the app itself -- the app only ever acts as the household OWNER
// (its own phone token/session), pairing a remote and configuring its map from the outside.

const ADMIN_PATH = "/api/integrations/hearth/physical-remote";
const PAIR_PATH = "/api/integrations/hearth/physical-remote/pair";
const MAPPING_PATH = "/api/integrations/hearth/physical-remote/mapping";
const REQUEST_TIMEOUT_MS = 8000;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;

export interface HouseholdRemote {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
  revokedAt: string | null;
}

/** One button's target: a single device command (the same shape the Activity editor's
 * commandChoicesFor/commandStepFromChoice already produce) or a whole existing Activity, run by
 * id. Mirrors the Pi's ButtonTargetSchema (remote-button-map.ts) field-for-field. */
export type RemoteButtonTarget = { kind: "command"; deviceId: string; capability: string; args?: Record<string, unknown> } | { kind: "activity"; activityId: string };

export type RemoteButtonMap = Record<string, RemoteButtonTarget>;

export interface RemotePairingCode {
  code: string;
  expiresAt: string;
}

/** Thrown by every call below with a reason the settings screen can show plainly instead of a raw status code. */
export type HouseholdRemotesErrorReason = "forbidden" | "not_found" | "limit_reached" | "unknown";

export class HouseholdRemotesError extends Error {
  constructor(public readonly reason: HouseholdRemotesErrorReason, message: string) {
    super(message);
  }
}

async function requireConfig() {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) throw new Error("Family Command Center isn't connected — add its address and token in Settings first.");
  return config;
}

function errorForStatus(status: number): HouseholdRemotesError {
  if (status === HTTP_FORBIDDEN) return new HouseholdRemotesError("forbidden", "Only the household owner can do that.");
  if (status === HTTP_NOT_FOUND) return new HouseholdRemotesError("not_found", "That remote is no longer on the list.");
  if (status === HTTP_UNPROCESSABLE) return new HouseholdRemotesError("limit_reached", "This remote already has as many buttons as it can hold.");
  return new HouseholdRemotesError("unknown", `Family Command Center returned ${status}.`);
}

/** Every physical remote paired to the household, for the owner-only "Household Remotes" settings screen. */
export async function fetchHouseholdRemotes(): Promise<HouseholdRemote[]> {
  const config = await requireConfig();
  const response = await fccFetch(config, ADMIN_PATH, undefined, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw errorForStatus(response.status);
  const body = (await response.json()) as { remotes?: HouseholdRemote[] };
  return Array.isArray(body.remotes) ? body.remotes : [];
}

async function postAdminAction(body: Record<string, unknown>): Promise<void> {
  const config = await requireConfig();
  const response = await fccFetch(config, ADMIN_PATH, { method: "POST", body: JSON.stringify(body) }, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw errorForStatus(response.status);
}

/** Renames a paired remote's displayed name. */
export function renameHouseholdRemote(id: string, name: string): Promise<void> {
  return postAdminAction({ id, name });
}

/** Revokes a remote's token; the Pi also drops its stored button map when this succeeds. */
export function revokeHouseholdRemote(id: string): Promise<void> {
  return postAdminAction({ id });
}

/** Mints a fresh single-use pairing code for a new physical remote (owner-only on the Pi) -- the
 * remote itself redeems it directly, the same way a new phone redeems an invite code, so the app
 * never sees or holds the remote's own token. */
export async function createRemotePairingCode(): Promise<RemotePairingCode> {
  const config = await requireConfig();
  const response = await fccFetch(config, PAIR_PATH, { method: "POST", body: JSON.stringify({}) }, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw errorForStatus(response.status);
  return response.json();
}

/** This remote's current button map, for the "Edit buttons" screen to show before editing.
 * Defaults to an empty map for a remote nothing has been set on yet. */
export async function fetchRemoteButtonMap(remoteId: string): Promise<RemoteButtonMap> {
  const config = await requireConfig();
  const response = await fccFetch(config, `${MAPPING_PATH}?remoteId=${encodeURIComponent(remoteId)}`, undefined, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw errorForStatus(response.status);
  const body = (await response.json()) as { buttons?: RemoteButtonMap };
  return body.buttons ?? {};
}

/** Replaces one remote's whole button map (the "Edit buttons" screen saves its full picked set at once, not incrementally). */
export async function saveRemoteButtonMap(remoteId: string, buttons: RemoteButtonMap): Promise<void> {
  const config = await requireConfig();
  const response = await fccFetch(config, MAPPING_PATH, { method: "PUT", body: JSON.stringify({ remoteId, buttons }) }, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw errorForStatus(response.status);
}
