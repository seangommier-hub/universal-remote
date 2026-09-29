import { HouseholdRemote, RemoteButtonMap } from "../discovery/householdRemotes";

// ADR-HEARTH-201: a fixed, invented paired-remotes list for visual verification of the
// "Household remotes" settings screen (list, pair flow) and the "Edit buttons" picker.
// Deterministic, mirroring demoHouseholdPhones.ts's shape.

const DEMO_YEAR = 2026;

function at(hours: number, minutes: number): string {
  return new Date(DEMO_YEAR, 0, 1, hours, minutes).toISOString();
}

/** Entries the demo Family Command Center returns from GET physical-remote. */
export function demoHouseholdRemotesBody(): { remotes: HouseholdRemote[] } {
  return {
    remotes: [
      { id: "demo-remote-living-room", name: "Living room remote", createdAt: at(9, 0), lastUsedAt: at(21, 40), revoked: false, revokedAt: null },
      { id: "demo-remote-bedroom", name: "Bedroom remote", createdAt: at(9, 5), lastUsedAt: null, revoked: false, revokedAt: null },
    ],
  };
}

/** The demo response for pairing a new remote (POST physical-remote/pair). */
export function demoRemotePairingCodeBody(): { code: string; expiresAt: string } {
  return { code: "N5SSXF3R", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
}

/** The demo button map already assigned to "Living room remote", so the Edit buttons screen has
 * something real to show instead of every slot reading "Not set". */
export function demoRemoteButtonMapBody(): { buttons: RemoteButtonMap } {
  return {
    buttons: {
      power: { kind: "command", deviceId: "demo-lg", capability: "power" },
      volumeUp: { kind: "command", deviceId: "demo-lg", capability: "volumeUp" },
    },
  };
}
