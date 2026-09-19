# ADR-HEARTH-094: Household dashboard labels expand "Suggested From Your Network" beyond recognized brands

**Date:** 2026-09-19
**Status:** Accepted, implemented (spans both Hearth and Family Command Center)

## Context

Sean: "does this now allow the user to see all devices on their network? if not, make it so that
it can happen. deploy agents and figure out any complexities."

Two agents investigated in parallel before any design decision:

1. **Hearth-side**: confirmed the full `DiscoverDevicesScreen` already shows literally every
   device the network scan returns, unfiltered — unrecognized ones are honestly labeled "Not yet
   supported," never hidden. The gap was specifically ADR-HEARTH-092's new inline home-screen
   section, deliberately scoped to `driverId.length > 0` only.
2. **Family Command Center backend** (investigated live over SSH, read-only): the Pi's device
   inventory is genuinely Pi-hole/router-DHCP-backed — on a real sample, ~25% of entries were
   obvious clutter (a phone, a laptop), ~40% were smart-home-plausible but unrecognized by Hearth's
   6-brand regex list (three Ring devices weren't matched at all), the rest ambiguous. Also found:
   an unrelated agent claim that the endpoint was "deployed stale and 404ing live" was checked
   directly (`curl` returned 401, not 404) and was **false** — worth noting since it could have
   caused an unnecessary production rebuild if acted on without verification.

Critically, that same investigation found the Pi's own dashboard already has a real
category-labeling system (`device-labels.ts`, `network_device_labels` in Supabase, categories
`tv`/`computer`/`phone`/`smart_speaker`/`smart_device`/`other`) that Hearth's endpoint never
queried — a household member can already tag a device's type on the FCC dashboard, but that
information stopped at the dashboard's own door.

## Question asked (ADR-GLOBAL-002)

The `/api/integrations/hearth/devices` endpoint carries an explicit, documented boundary in its own
source comment: "no household_id, no Supabase data... this is a discovery convenience, not a new
information disclosure." Exposing category data — even just the category, not the human-typed
nickname — would cross that documented line. Flagged this directly and asked before touching it.

## Answer

Sean: expose category only, not the nickname.

## Decision

**Family Command Center** (`src/app/api/integrations/hearth/devices/route.ts`): added
`attachCategories()`, joining `network_device_labels` via the existing `getDeviceLabels()` and the
already-established `HOUSEHOLD_ID` env var pattern (the same one `scripts/network-pause/resume-
expired.js` already uses for non-request-scoped household context). Attaches only `category` per
device — `nickname` is read from the same table internally but never included in the response.
Best-effort: no `HOUSEHOLD_ID` configured, or the Supabase lookup failing, degrades every device to
`category: null` rather than failing the request, the same treatment the router data source in this
same file already gets. New test (`attachCategories.test.ts`) explicitly asserts the nickname never
appears in the response. Deployed, rebuilt, and restarted live; verified via the real endpoint
(401 on a bad token, confirming the route itself works) and `npm test`/`tsc --noEmit` on the Pi.

**Hearth** (`FamilyCommandCenterDiscoveryProvider.ts`, `DeviceListScreen.tsx`): the new `category`
rides through as `metadata.householdCategory` on each `DiscoveredDevice` (deliberately not reusing
Hearth's own `DeviceCategory` type — a completely different vocabulary for a different question).
"Suggested From Your Network" now shows a device if it's either a recognized brand (unchanged,
instant one-tap connect) **or** its household category is `tv`/`smart_speaker`/`smart_device`
(`HOUSEHOLD_PLAUSIBLE_CATEGORIES`) — `computer`/`phone`/`other` are deliberately excluded, since a
household member explicitly tagged those as not smart-home devices. For a labeled-but-unrecognized
suggestion, "Add" can't instant-connect (no driver) — it opens the same brand-picker
ADR-HEARTH-062 already established for exactly this "recognized as a real device, wrong/no
classifier match" situation, pre-filling the IP.

## Consequences

- A household that actively uses the FCC dashboard's device labels gets meaningfully better home-
  screen suggestions (Ring and other never-brand-matched devices, once labeled `smart_device`,
  become visible without waiting on a new Hearth driver at all). A household that's never touched
  those labels sees no change — the section still shows nothing for genuinely unrecognized,
  unlabeled devices, correctly staying conservative rather than guessing.
- The full `DiscoverDevicesScreen` remains the actual "see everything" view — this change makes the
  home screen's *curated* suggestions smarter, it doesn't change what "see all devices" already
  meant before this ADR.
- This is the first Hearth feature whose correctness depends on a change in a sibling project
  (family-command-center) being deployed — if that Pi's deployment is ever rolled back independent
  of Hearth's own version, `householdCategory` silently becomes always-null (graceful, not broken),
  since Hearth never assumes the field is present.
