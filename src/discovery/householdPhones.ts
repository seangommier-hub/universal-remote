import { fccFetch } from "../core/network/fccRequest";
import { HouseholdRole, loadFamilyCommandCenterConfig, saveOwnRole } from "./familyCommandCenterConfig";

// Client for the Hearth phone-tokens admin/self routes (ADR-HEARTH-189, phase 2): the "Household
// phones" settings screen (list, rename, change role, revoke) and the self-role check that decides
// whether a phone may even see that screen. Same LAN-then-public client every other FCC call uses.

const ADMIN_PATH = "/api/integrations/hearth/phone-tokens";
const SELF_PATH = "/api/integrations/hearth/phone-tokens/self";
const REQUEST_TIMEOUT_MS = 8000;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

export interface HouseholdPhone {
  id: string;
  phoneName: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
  revokedAt: string | null;
  role: HouseholdRole;
  guestExpiresAt: string | null;
}

export interface OwnIdentity {
  id: string | null;
  phoneName: string | null;
  role: HouseholdRole;
}

/** Thrown by every mutating call below with a reason the settings screen can show plainly instead
 * of a raw status code. */
export type HouseholdPhonesErrorReason = "forbidden" | "not_found" | "last_owner" | "unknown";

export class HouseholdPhonesError extends Error {
  constructor(public readonly reason: HouseholdPhonesErrorReason, message: string) {
    super(message);
  }
}

async function requireConfig() {
  const config = await loadFamilyCommandCenterConfig();
  if (!config) throw new Error("Family Command Center isn't connected — add its address and token in Settings first.");
  return config;
}

function errorForStatus(status: number): HouseholdPhonesError {
  if (status === HTTP_FORBIDDEN) return new HouseholdPhonesError("forbidden", "Only the household owner can do that.");
  if (status === HTTP_NOT_FOUND) return new HouseholdPhonesError("not_found", "That phone is no longer on the list.");
  if (status === HTTP_CONFLICT) return new HouseholdPhonesError("last_owner", "Can't remove the household's only remaining owner.");
  return new HouseholdPhonesError("unknown", `Family Command Center returned ${status}.`);
}

/** This phone's own role, id and name, straight from the Pi -- never cached-only, since a settings
 * screen deciding whether to show owner-only controls needs the current truth, not yesterday's. */
export async function fetchOwnIdentity(): Promise<OwnIdentity> {
  const config = await requireConfig();
  const response = await fccFetch(config, SELF_PATH, undefined, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw errorForStatus(response.status);
  return response.json();
}

/** Refreshes and caches this phone's own role (see familyCommandCenterConfig.ts's `role` field) for
 * quick reads elsewhere (e.g. deciding whether to show the "Household phones" settings entry
 * without a network round trip on every render). Never throws -- a failed refresh just leaves the
 * previously-cached role in place, since this is a convenience cache, not the source of truth. */
export async function refreshOwnRole(): Promise<HouseholdRole | null> {
  try {
    const identity = await fetchOwnIdentity();
    await saveOwnRole(identity.role);
    return identity.role;
  } catch {
    return null;
  }
}

/** Every phone on the household, for the owner-only "Household phones" settings screen. Throws
 * HouseholdPhonesError("forbidden") for a non-owner phone (the screen should never be reachable by
 * one, but the server enforces it regardless). */
export async function fetchHouseholdPhones(): Promise<HouseholdPhone[]> {
  const config = await requireConfig();
  const response = await fccFetch(config, ADMIN_PATH, undefined, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw errorForStatus(response.status);
  const body = (await response.json()) as { tokens?: HouseholdPhone[] };
  return Array.isArray(body.tokens) ? body.tokens : [];
}

async function postAdminAction(body: Record<string, unknown>): Promise<void> {
  const config = await requireConfig();
  const response = await fccFetch(config, ADMIN_PATH, { method: "POST", body: JSON.stringify(body) }, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw errorForStatus(response.status);
}

/** Changes another phone's role. Throws HouseholdPhonesError("last_owner") if `id` is the
 * household's only remaining owner and `role` isn't "owner" -- the server's own guard, surfaced
 * here so the screen can show a plain explanation instead of a raw 409. */
export function setHouseholdPhoneRole(id: string, role: HouseholdRole): Promise<void> {
  return postAdminAction({ id, role });
}

/** Renames another phone's displayed name. */
export function renameHouseholdPhone(id: string, phoneName: string): Promise<void> {
  return postAdminAction({ id, phoneName });
}

/** Revokes another phone's token. Throws HouseholdPhonesError("last_owner") for the household's
 * only remaining owner, same guard as `setHouseholdPhoneRole`. */
export function revokeHouseholdPhone(id: string): Promise<void> {
  return postAdminAction({ id });
}
