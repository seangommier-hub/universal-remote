# ADR-HEARTH-189: Per-phone roles, phase 2 (app side)

**Date:** 2026-09-27. Status: accepted. Companion to the Pi's adr/0218 (family-command-center repo,
renumbered from an initial 0217 collision with a concurrent camera-ADR commit — see that ADR's own
note), which does the actual role storage, guest invites, last-owner guard and audit log. This ADR
covers only what the phone app does: a "Household phones" settings screen, guest device filtering,
and knowing this phone's own role. Extends ADR-HEARTH-181 (per-phone tokens, phase 1) and reuses
ADR-HEARTH-176's kid-mode restriction pattern for guests.

## Problem

Phase 1 shipped per-phone tokens but explicitly deferred roles: "list/revoke tokens exists as a Pi
route, but there's no button for it in the app" and "no dashboard panel." This phase gives every
phone a role (owner/adult/guest), lets an owner manage other phones from Hearth itself, and adds a
guest role that a babysitter-type visitor can use without a PIN and without seeing the whole house.

## Decisions

### This phone's own role: cached, refreshed, never assumed
`FamilyCommandCenterConfig` gains an optional `role?: "owner" | "adult" | "guest"` (plain
AsyncStorage, like `tokenKind` — metadata about the connection, not a secret). `householdPhones.ts`'s
`refreshOwnRole()` calls the Pi's new `GET phone-tokens/self` and caches the answer via
`saveOwnRole()`; it **never throws** — a failed refresh just leaves whatever was cached (or nothing)
in place, since this is a convenience cache for deciding what UI to show, not a security boundary
the Pi doesn't already enforce for itself. Both `FamilyCommandCenterSettingsScreen` and
`DevicesTabScreen` read the cached config on mount for an instant first render, then call
`refreshOwnRole()` in the background and update state if it resolves — a stale cached role only
means the "Household phones" entry point or guest device filtering briefly lags a real
promotion/demotion/expiry, not that either is ever wrong for more than one screen visit.

### "Household phones" settings screen
`HouseholdPhonesScreen.tsx`, reachable only via a button on `FamilyCommandCenterSettingsScreen` shown
only when this phone's cached role is `"owner"`. Lists every phone (name, role, last-used, guest
expiry), and lets an owner rename, change the role of, or revoke any OTHER phone, plus create a
time-limited guest invite. All three mutating actions go through `householdPhones.ts`
(`setHouseholdPhoneRole`, `renameHouseholdPhone`, `revokeHouseholdPhone`), which POSTs to the same
`/phone-tokens` route phase 1 already used for revoke, dispatched by body shape on the Pi (no new
endpoint). A `HouseholdPhonesError` with a plain `reason` (`forbidden` / `not_found` / `last_owner` /
`unknown`) is thrown for every non-2xx response so the screen can show "Can't remove the household's
only remaining owner" instead of a raw 409 — this is the client-side surface for the Pi's
self-lockout guard (adr/0218), not a re-implementation of it; the app trusts the Pi's answer and
never tries to compute "is this the last owner" itself.

### Guest invite, with an expiry the owner picks
`pairClient.ts`'s `createPairInvite(baseUrl, token, guestHours?)` gained an optional third
parameter — passing it asks the Pi for a guest-role invite instead of an ordinary one (owner-gated
there); omitting it is byte-for-byte phase 1's existing call, so `InviteSomeonePanel` (ordinary
household invites) needed zero changes. `HouseholdPhonesScreen` has its own "Invite a guest" section
with an hours field (whole number, at least 1) reusing the same code/countdown/share UI pattern as
`InviteSomeonePanel`.

### Guest device filtering: the same concept as kid mode, a separate list
Per the task brief ("reuse the layout-store 'allowed devices' concept from kid mode rather than
building a parallel system"): `DeviceLayout` gains `guestAllowed: string[]`, pruned and normalized
exactly like `kidAllowed`. `core/guestMode/guestModeFilter.ts` is `devicesVisibleInMode`/
`toggleKidAllowed` (ADR-HEARTH-176)'s exact filtering shape, under new names
(`devicesVisibleToGuest`/`toggleGuestAllowed`), reusing the *mechanism* rather than the *list* —
a guest (a babysitter, a known adult) and "safe for a kid" are conceptually different sets an owner
sets independently, even though both are simple allow-lists. `useDeviceLayout(devices, kidRestricted,
guestRestricted)` composes both filters (guest applied after kid, so if a phone were ever
simultaneously both — never expected in practice — each filter only narrows further, never leaks).
The long-press device menu (`DeviceActionsModal`) gained a parallel "Allowed for guests / Not allowed
for guests" option next to kid mode's existing one.

### No PIN, no bedtime, no local toggle — because it isn't a local concept
Unlike kid mode (a local per-phone setting an adult turns on and protects with a PIN), a guest's
restriction is entirely a property of **this phone's own token role on the Pi**. There is nothing to
"turn on" locally and nothing to "leave" with a PIN — the restriction stops applying only when the
Pi's own role for this token changes (promoted by an owner) or the guest token expires, both of
which `refreshOwnRole()` picks up the next time it runs. `GuestDeviceListScreen.tsx` is therefore a
much smaller sibling of `KidDeviceListScreen`: same allowed-devices-only list, same hidden
Add/Discover/settings/editors (reusing `DevicesTabScreen`'s existing `restrictedSafeScreen` — renamed
from `kidSafeScreen` since it now guards both restricted modes, no behavior change), but no lock
button and no `KidModePinModal`.

### Self-lockout prevention is server-enforced; the app surfaces it, never re-derives it
Sean's and Leah's phones are not to be locked out by this change. The app does nothing special here
on purpose: `setHouseholdPhoneRole`/`revokeHouseholdPhone` simply forward whatever the Pi decides
(`HouseholdPhonesError("last_owner")` on a 409) rather than trying to compute "is this the last
owner" client-side from a possibly-stale phone list — the Pi is the only place that invariant can be
correctly enforced (adr/0218), and the app second-guessing it would risk a UI that blocks something
the server would have allowed, or vice versa.

## Alternatives rejected

- **A parallel `GuestModeSettingsPanel`/local guest toggle mirroring `KidModeSettingsPanel`:**
  rejected — there is no local state to toggle; a guest phone's restriction comes from its token,
  set by an owner elsewhere. Building one would invite exactly the drift ADR-GLOBAL-003 warns about
  (two places that could disagree about whether a phone is restricted).
- **Literally sharing `kidAllowed` as the guest-allowed list too** (rather than a separate
  `guestAllowed`): rejected — reusing kid mode's own `kidAllowed`/`toggleKidAllowed` functions
  outright would mean a kid-allowed device and a guest-allowed device are always the same set, which
  the task brief explicitly did not ask for ("a guest and 'devices safe for a kid' are not always
  the same set"). Splitting into a same-shaped sibling (`guestAllowed`/`toggleGuestAllowed`) keeps
  the two lists set independently while still reusing the identical filtering mechanism.
- **Re-deriving the last-owner guard client-side** (e.g. disabling the role/revoke buttons for a
  phone the app's own cached list thinks is the only owner): rejected — the phone list is a snapshot
  that can be stale the moment another owner acts elsewhere; trusting the Pi's real-time 409 is the
  only correct source of truth, and a disabled-looking button the server would actually have allowed
  is worse UX than an inline error after a genuine conflict.

## Tests

Jest: `householdPhones.test.ts` (self/list/role-change/rename/revoke, every HouseholdPhonesError
reason mapped from its status code including `last_owner` from a 409 — the self-lockout prevention
surfaced to the UI — and `refreshOwnRole` never rejecting), `familyCommandCenterConfig.test.ts`
(role read-back undefined/saved, `saveOwnRole` attaching to an existing config and no-op-ing
without one), `pairClient.test.ts` (guest invite body/headers, ordinary invite unchanged),
`guestModeFilter.test.ts` (guest-only filtering, empty allowed list shows nothing — never leaks the
rest of the household through this route — pruned/unknown ids ignored), `deviceLayoutPersistence.test.ts`
/`deviceLayout.test.ts` updated for the new `guestAllowed` field.

`npx tsc --noEmit`: clean. `npx jest --silent --testPathIgnorePatterns="node_modules"`: 2098 passed,
18 skipped, 1 pre-existing failure in `runner/shims/shims.test.ts` (unrelated, per standing
instruction to ignore it).

Web harness (`node scripts/ui-verify/run.mjs --only=household-phones,household-phones-guest-invite`):
new demo fixtures (`src/demo/demoHouseholdPhones.ts`, wired into `demoFetch.ts` for the self/list/
pair-code paths) render the household phones list (three demo phones: owner "this phone", an adult,
and a guest with a visible expiry), the role picker (highlighted current role per row), rename and
revoke controls, and a full guest-invite flow (hours field → code → share) — screenshots checked,
matches the intended design.

## Not verified

Real phone/real Pi round trip for the app screens specifically (the Pi side's own live verification,
covered in adr/0218, exercised the same routes directly by curl); `GuestDeviceListScreen` has not
been eyeballed on a real guest-role phone, only reasoned about from the same tested filtering logic
kid mode's equivalent screen already uses.
