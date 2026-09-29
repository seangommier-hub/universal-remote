# ADR-HEARTH-201: Physical remote pairing and button mapping (app side)

**Date:** 2026-09-29
**Status:** Accepted

Companion to the Pi's `adr/0250` (family-command-center repo), which does the actual token
issuance/verification, pairing-code minting/redemption, button-map storage, and button-event
resolution. This ADR covers only what the Hearth app does: a "Household Remotes" settings screen
(list, rename, revoke, pair) and a per-remote "Edit buttons" screen.

## Scope and what this is NOT

ADR-HEARTH-197 (physical remote hardware design) is still Proposed -- Sean has not yet answered its
open hardware questions (battery, WiFi vs. Bluetooth, enclosure, one remote vs. many, budget). This
ADR builds only the software half ADR-HEARTH-197's own Phase 1 description calls out as buildable
ahead of hardware ("a new Pi route, no IR/battery/enclosure"): pairing, mapping storage, and the app
screens to drive both. **No firmware was written, no capability ids were added, and no native
dependency was introduced** (BLE/serial libraries were explicitly out of scope per the task brief --
this is all HTTP against the Pi, matching ADR-HEARTH-197 Section 3's WiFi-to-Pi recommendation).

## Decisions

### A new client module, isolated from the phone-token client on purpose
`src/discovery/householdRemotes.ts` mirrors `householdPhones.ts`'s shape (fetch list, rename,
revoke, errors mapped from HTTP status to plain reasons) but talks to the Pi's entirely separate
`physical-remote/*` route family and error space (`forbidden`/`not_found`/`limit_reached`/`unknown`
-- no `last_owner`, since a physical remote is never anyone's only way to administer the household,
matching the Pi's own `revokeRemoteToken` having no such guard). The app never holds or sends a
physical remote's own bearer token at any point -- it only ever acts as the household owner (its own
phone token or session), pairing a remote and configuring its map from the outside. Also adds
`createRemotePairingCode` (mints a code the remote itself redeems directly against the Pi -- the app
never sees the resulting remote token) and `fetchRemoteButtonMap`/`saveRemoteButtonMap` for the
per-remote button editor.

### "Household Remotes" settings screen, mirroring HouseholdPhonesScreen.tsx
`HouseholdRemotesScreen.tsx` lists every paired remote (name, last-used, revoked state), lets an
owner rename or revoke any remote, opens its "Edit buttons" screen, and has its own "Pair a remote"
section that generates a single-use code (same countdown/expiry UI pattern
`HouseholdPhonesScreen`'s guest-invite section already established, reusing `inviteCountdown.ts`).
Reachable only via a new "Household remotes" button on `FamilyCommandCenterSettingsScreen`, shown
only when `isOwner` -- the exact same gating the existing "Household phones" button already uses,
copy-pasted onto a second `onOpenHouseholdRemotes` prop rather than generalized into one
"admin screens" concept, since the two screens' actions (phone roles vs. remote pairing) are
different enough that a shared abstraction would be premature.

Unlike the guest-invite flow (which shares a link a person taps), the pairing code has no "Share a
link" action that makes sense for a physical device -- there is no browser on the remote to open a
link in. It's just displayed large, for whatever the remote's own input method turns out to be
(typed via its own buttons, entered through a companion flashing tool, etc. -- undetermined until
ADR-HEARTH-197's hardware questions are answered). A "Share pairing code" button is kept anyway
(same `Share.share` pattern as the guest invite) purely as a convenience for e.g. sending the code
to a note or another device while setting up -- not a claim that pairing happens via a shared link.

### "Edit buttons" screen: reuses the Activity editor's exact picker, no new concept
`EditRemoteButtonsScreen.tsx` lists a fixed set of button slots matching ADR-HEARTH-197 Section 5's
Phase 1 layout (power, volume up/down, mute, 4-way d-pad, center/select, back, home -- 11 labeled
slots). Tapping "Assign" on a slot expands the **exact same** `commandChoicesFor`/
`commandStepFromChoice` picker `ActivityEditorScreen.tsx` already uses per device (ADR-HEARTH-197
Section 4's explicit instruction), plus a row of existing Activities to assign the whole Activity to
one press. Saving sends the complete button map at once via `saveRemoteButtonMap` (PUT, replaces
wholesale, matching the Pi's own "replace, not merge" store semantics).

**Known limitation, inherited from reusing the picker as-is rather than extending it:**
`commandChoicesFor`'s `NO_ARG_CAPABILITIES` set does not include `directionalNavigation` (the d-pad's
actual capability, which takes a `direction` argument) or `selectPlayPause`. This means the four
d-pad slots and the "Center / Select" slot cannot currently be assigned a *device* command through
this reused picker -- only a whole Activity. This is a direct, honest consequence of the task's own
instruction to reuse the picker rather than build a parallel one; extending `commandChoicesFor` to
cover argument-taking navigation capabilities is a real follow-up but out of scope here (it would
also affect the Activity editor itself, not just this screen, and deserves its own ADR).

### A small addition to the Pi's mapping GET beyond adr/0250's original route list
The Pi's `GET physical-remote/mapping` route, as adr/0250 first specified it, only accepted the
remote's own bearer token -- there was no owner-readable path, so this screen would have had no way
to show a remote's *current* map before editing it. adr/0250 was extended (documented there, not
here) to also accept an owner caller with `?remoteId=`, the same dual-auth-on-one-GET precedent
`phone-tokens/route.ts` already uses (bearer or session). `householdRemotes.ts`'s
`fetchRemoteButtonMap` uses that query-param path exclusively -- the app never has a remote's own
token to use the other path with.

### Demo fixtures and the web harness
`src/demo/demoHouseholdRemotes.ts` mirrors `demoHouseholdPhones.ts`'s shape (two invented paired
remotes, a fixed pairing code, one remote pre-populated with a real button assignment against the
demo LG TV so the Edit buttons screen has something real to show, not every slot reading "Not set").
Wired into `demoFetch.ts` (checked before the shorter admin-path substring match, same ordering
convention `PHONE_TOKENS_SELF_PATH` already uses) and `demoScreenRoute.ts`
(`fcc-household-remotes`). New `scripts/ui-verify` scenarios: `household-remotes`,
`household-remotes-pair`, `household-remotes-edit-buttons` -- all screenshotted and eyeballed
(list, pairing-code display, and the expanded per-device command picker showing a device's full
`commandChoicesFor` output plus the existing "Power: Living Room TV" assignment).

## Alternatives rejected

- **A single shared "AdminEntryButton" abstraction for Household phones vs. Household remotes:**
  rejected as premature -- two data shapes, two error-reason sets, two very different screens behind
  them; the only thing genuinely shared is "owner-gated settings-screen entry point", which a
  two-line copy-paste already expresses without inventing an abstraction for two call sites.
- **Extending `commandChoicesFor` to add `directionalNavigation`/`selectPlayPause` choices as part
  of this change:** rejected -- out of scope per the task brief ("no new capability ids"), and this
  function is shared with `ActivityEditorScreen.tsx`; changing what it offers there is a decision
  that affects Activities generally and deserves its own ADR and its own look at whether every
  driver's `directionalNavigation` support is even consistent enough to expose this way yet.
- **A companion "share a pairing link" flow for the remote, mirroring the guest invite's tappable
  link:** rejected -- a physical remote has no browser to open a link in; the code itself, displayed
  plainly, is the only thing that generalizes across whatever input method Phase 2's actual hardware
  turns out to have.

## Tests

Jest: `householdRemotes.test.ts` (list/rename/revoke status-to-reason mapping including the new
`limit_reached` reason, `createRemotePairingCode`'s request shape, `fetchRemoteButtonMap`'s
`?remoteId=` query and empty-map default, `saveRemoteButtonMap`'s PUT body shape) -- 14 tests, all
passing. No component-level test for `HouseholdRemotesScreen`/`EditRemoteButtonsScreen` themselves,
matching this codebase's existing convention of testing the pure client logic behind a settings
screen rather than the React component wiring it up (`HouseholdPhonesScreen.tsx` has none either).

`npx tsc --noEmit`: clean. `npx jest --silent --testPathIgnorePatterns="node_modules"`: 2314 passed,
18 skipped, 1 pre-existing failure in `runner/shims/shims.test.ts` (`WebSocketServer is not a
constructor`, unrelated to this change -- same pre-existing failure ADR-HEARTH-181/189 already
documented and were instructed to ignore).

Web harness (`node scripts/ui-verify/run.mjs --only=household-remotes,household-remotes-pair,household-remotes-edit-buttons`):
all three scenarios render without a page error; screenshots checked -- the remotes list (two demo
remotes, rename/revoke/edit-buttons controls), the pairing-code display with countdown, and the
per-device command picker expanded under "Power" (showing "Living Room TV: power" already assigned
from the demo fixture, plus the full chip list of every other command that device declares).
`fcc-settings-activity` and `household-phones` scenarios re-run afterward to confirm nothing on the
existing settings screen or phones screen regressed.

## What is real vs. what still needs the Pi side and/or hardware

**Real and verified here:** the app's own client logic (tested), TypeScript types matching the Pi's
zod schemas field-for-field, and the UI rendering correctly against demo fixtures shaped exactly
like the Pi's real response bodies (confirmed against adr/0250's own live-curl verification of the
same response shapes).

**NOT verified from the app side:** a real phone-to-Pi round trip (the Pi's own adr/0250 covers live
verification of the routes themselves, by curl, against the real running service); this app has not
been run against a real Family Command Center from a device or simulator for this feature
specifically. An actual physical remote redeeming a pairing code, fetching its map, or reporting a
button press does not exist to test against at all -- ADR-HEARTH-197's hardware questions remain
open.

## Consequences

An owner can now pair, rename, revoke, and configure the button map for a physical remote from
Hearth itself, entirely through the household's existing per-phone-token owner privilege -- no new
account, credential, or capability was introduced. The screens are ready and tested; what happens
next is either Sean answering ADR-HEARTH-197's hardware questions to start Phase 2 hardware/firmware
work, or a follow-up ADR extending `commandChoicesFor` if d-pad/select mapping turns out to matter
before then.
