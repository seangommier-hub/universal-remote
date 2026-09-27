import { HouseholdPhone } from "../discovery/householdPhones";

// ADR-HEARTH-189 (phase 2): a fixed, invented household phones list for visual verification of the
// "Household phones" settings screen (list, role picker, guest invite). Deterministic, mirroring
// demoActivityLog.ts's shape for the activity log screen.

const DEMO_YEAR = 2026;

function at(hours: number, minutes: number): string {
  return new Date(DEMO_YEAR, 0, 1, hours, minutes).toISOString();
}

/** This demo phone's own identity -- always the owner, so the "Household phones" entry point and
 * every owner-only control are visible for the harness to screenshot. */
export function demoOwnIdentity(): { id: string; phoneName: string; role: "owner" } {
  return { id: "demo-owner", phoneName: "Sean's iPhone", role: "owner" };
}

/** Entries the demo Family Command Center returns from GET phone-tokens. */
export function demoHouseholdPhonesBody(): { tokens: HouseholdPhone[] } {
  const owner = demoOwnIdentity();
  return {
    tokens: [
      { id: owner.id, phoneName: owner.phoneName, role: "owner", createdAt: at(9, 0), lastUsedAt: at(21, 40), revoked: false, revokedAt: null, guestExpiresAt: null },
      { id: "demo-leah", phoneName: "Leah's iPhone", role: "adult", createdAt: at(9, 5), lastUsedAt: at(21, 5), revoked: false, revokedAt: null, guestExpiresAt: null },
      {
        id: "demo-guest",
        phoneName: "The babysitter's phone",
        role: "guest",
        createdAt: at(18, 0),
        lastUsedAt: at(18, 30),
        revoked: false,
        revokedAt: null,
        guestExpiresAt: new Date(DEMO_YEAR, 0, 1, 23, 0).toISOString(),
      },
    ],
  };
}

/** The demo response for creating a guest invite (POST pair/code). */
export function demoGuestInviteBody(): { code: string; expiresAt: string; publicBaseUrl: string | null; baseUrl: string } {
  return { code: "K7M2QX9P", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), publicBaseUrl: null, baseUrl: "http://demo-fcc.invalid:3211" };
}
