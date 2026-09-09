# ADR-HEARTH-010: Family Command Center discovery integration

**Date:** 2026-09-08
**Status:** Accepted

## Context

Sean: "the app should be able to find devices on the same wifi network" —
direct follow-up to ADR-HEARTH-008's persistence fix, which solved *repeated*
manual entry but not manual entry itself. Real mDNS/SSDP discovery
(`ROADMAP.md` Phase 3) requires an Expo Development Build per
`docs/EXPO_COMPATIBILITY.md` — a bigger transition than this specific ask
needed.

Sean also asked the family-command-center session (a sibling project,
already tracking this household's network) to collaborate directly, since
it already has device-inventory visibility this app doesn't. That session
wrote this integration directly into this repo.

## Decision

`src/discovery/FamilyCommandCenterDiscoveryProvider.ts` implements the
existing `DiscoveryProvider` interface (`src/core/discovery/`, previously
unimplemented) against Family Command Center's own REST endpoint
(`GET /api/integrations/hearth/devices`, bearer-token authenticated) instead
of a network-level discovery protocol. Devices are classified by brand
(hostname/vendor string matching) into a `driverId` when recognized;
unrecognized devices are still surfaced, honestly labeled "not yet
supported," never silently dropped.

Connection settings (base URL + bearer token) follow the same
AsyncStorage/SecureStore split as device credentials (ADR-HEARTH-008): URL
in AsyncStorage, token in SecureStore. `FamilyCommandCenterSettingsScreen`
verifies the token actually works (a real authenticated request) before
saving it, rather than accepting anything typed.

`DiscoverDevicesScreen` lists results and lets the user connect a
recognized device with one tap — the exact manual-IP-entry pain
ADR-HEARTH-008 identified, now solved for anyone running Family Command
Center, without waiting on the Dev Build transition.

## Rationale

Sean, once this was built: "connect to the device based on the fact that it
is on the wifi. a home will have a code needed to connect, hence the
command center integration. for security purposes." This confirms the
design intent directly — the bearer token *is* that home-specific
connection code, gating which household's device inventory an install of
Hearth can pull from. This wasn't a workaround pending "real" security; it
is the intended security model for this discovery path.

Avoiding a new discovery protocol implementation (mDNS/SSDP still
unimplemented, still Phase 3) by delegating to a project that already
solves network inventory is the same "don't rebuild what already exists"
judgment as reusing `UniversalTvRemote` for Roku (ADR-HEARTH-007) rather
than a new component.

## Consequences

- This discovery path only ever surfaces what Family Command Center's own
  backend already knows about — it is not a substitute for real
  network-level discovery for households that don't run that project.
  Phase 3 (mDNS/SSDP, Dev Build required) remains the general-purpose path.
- **Open requirement, not yet implemented**: Sean asked that this also work
  "for a router with an iot, guest, and ext" — i.e. across multiple network
  segments/VLANs, not just the primary LAN. This is NOT fixable from
  Hearth's side: `FamilyCommandCenterDiscoveryProvider` only ever returns
  what the `/api/integrations/hearth/devices` endpoint reports. Whether
  IoT/guest/ext-segment devices appear depends entirely on whether Family
  Command Center's own backend has visibility into those segments (e.g. via
  router API/multi-VLAN Pi-hole querying) — relayed to that session as a
  backend requirement, not scoped into this ADR.
- If Family Command Center's response schema adds a network-segment label
  per device, `LanDevice`/`DiscoveredDevice.metadata` should be extended to
  carry it so the UI can show which segment a device was found on — not
  done speculatively ahead of that data actually existing.
- Corrected in this ADR: the contributed code originally cited
  "ADR-HEARTH-009" in comments, written before this project's actual
  ADR-009 (UI design pass) existed. All references fixed to ADR-HEARTH-010
  (this document) to keep the ADR trail accurate.
