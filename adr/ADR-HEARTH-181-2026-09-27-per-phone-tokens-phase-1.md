# ADR-HEARTH-181: Per-phone tokens, phase 1 (app side)

Date: 2026-09-27. Status: accepted. Companion to the Pi's adr/0203 (family-command-center repo),
which does the actual issuing/verifying/revoking. This ADR covers only what the phone app does:
send a name with redeem, remember which kind of token it holds, and nudge (never force) a re-pair.
Full roles/permissions per token are an explicit future phase, not this one.

## Problem

Every phone shared one `HEARTH_API_TOKEN`. The Pi now (adr/0203) mints a personal token per phone
at `pair/redeem` instead of handing back the shared one. The app side needs to: send something
useful for the Pi's admin list to label a token by; remember, per saved connection, whether it's
the old shared token or a new personal one; and, critically, do this without breaking Sean's or
Leah's phones, which are already paired on the shared token and must keep working exactly as
before until they naturally re-pair.

## Decision

### Sending a name with redeem
`pairClient.ts`'s `redeemPairCode` now sends `phoneName: getPhoneName()` in the redeem body —
reusing the name a phone already has (`runtime/phoneName.ts`, ADR-HEARTH-170's "whose name shows in
the activity log" field) rather than inventing a second "what do I call myself" concept. Nothing
new for a person to set up; a phone that has never set a name falls back to the same generic
default the activity log already uses ("Someone's iPhone" / "Someone's phone").

### Remembering the token kind
`FamilyCommandCenterConfig` gains an optional `tokenKind?: "legacy" | "personal"`, saved in
AsyncStorage (metadata about the token, not the token itself, so it stays out of SecureStore same
as `publicBaseUrl`). `verifyAndSaveFamilyCommandCenterConfig(baseUrl, token, tokenKind = "legacy")`
defaults to `"legacy"` — both existing callers (`ScanFamilyCommandCenterQrScreen.tsx`'s QR payload
and `FamilyCommandCenterSettingsScreen.tsx`'s manual-entry form) still only ever hand out the shared
token today, so they get labeled correctly without any change to either screen.
`joinHousehold.ts`'s `saveRedeemed` is the one path that now passes `"personal"` explicitly, since a
redeem always returns a fresh per-phone token as of adr/0203.

A config saved by the OLD app (before this field existed) has no `tokenKind` at all — `undefined`,
not `"legacy"`. Every reader treats those the same (`tokenUpgrade.ts`'s `usesLegacySharedToken`),
since there is no way to tell "definitely the shared token" from "predates this field" and both need
the identical one-time nudge.

### Migration path: nudge, never force
There is no stored invite/host to silently "re-redeem against" — invite codes are single-use and
expire in 10 minutes (adr/0194), so nothing survives from the original pairing to replay later.
That rules out an automatic, invisible upgrade. Instead: a **one-time, dismissible banner**
(`TokenUpgradeBanner.tsx` / `useTokenUpgradeBanner.ts`) on the Devices tab, shown whenever a
household is configured (`fccConfigured`) and `usesLegacySharedToken(config)` is true and the
banner hasn't been dismissed before (`runtime/tokenUpgradeBannerDismissal.ts`, a plain AsyncStorage
flag). It explains that a fresh pairing gets a personal token, offers a "Re-pair" button that opens
the existing invite-code Join screen (`onJoinWithCode`, ADR-HEARTH-149) — the same screen a person
already uses for a first pairing — and a dismiss (×) that hides it for good on that phone. It never
starts a re-pair on its own, and dismissing it does not touch the saved connection at all.

Once a person actually re-pairs through that screen, `joinHousehold` runs its normal replace-confirm
flow (ADR-HEARTH-160) exactly as today, and the newly-saved config gets `tokenKind: "personal"` —
the banner then stops appearing for that phone (`usesLegacySharedToken` returns false) with no
separate "mark upgraded" step needed.

### Backward compatibility, explicitly
- Sean's and Leah's current phones keep using their already-saved shared token, unmodified by this
  change — nothing here reads, rotates, or invalidates an existing saved token. The Pi's auth still
  accepts it (adr/0203's legacy-token path).
- The redeem response shape is unchanged (`{baseUrl, publicBaseUrl, token}`); a phone on an app
  version that doesn't yet send `phoneName` still gets a working personal token from the Pi (just
  labeled "Unnamed phone" there) — sending `phoneName` was designed as purely additive on the
  request side, not required by the response contract.
- The banner only appears when a household is already configured; it does not appear during, or
  interfere with, a first-time pairing.

## Alternatives rejected

- **Silently re-redeeming on app launch using a remembered invite/host:** not possible — codes are
  single-use and expire in 10 minutes by design (adr/0194); nothing to replay exists after the
  original pairing completed.
- **Forcing a re-pair (e.g. rejecting the old token client-side, or auto-navigating to Join on every
  launch):** rejected outright by the task brief and by ADR-HEARTH-160's own "a link/action never
  joins without confirmation" precedent — an unprompted forced re-pair breaks a working phone the
  moment this ships, which is exactly what phase 1 must not do.
- **A permanent (non-dismissible) banner:** rejected as exactly the kind of "notification flood"
  ADR-HEARTH-162 already flagged as a top complaint in comparable apps; one nudge, dismissible, is
  enough — the underlying legacy-token path keeps working regardless of whether anyone re-pairs.

## Tests

Jest: `familyCommandCenterConfig.test.ts` (tokenKind defaults to "legacy", saves an explicit kind,
reads back undefined vs. a saved kind), `joinHousehold.test.ts` (a redeem's saved config always gets
`tokenKind: "personal"`, both the direct-LAN and away-from-home/public-fallback paths),
`pairClient.test.ts` (redeem body includes `phoneName`), `tokenUpgrade.test.ts`
(`usesLegacySharedToken` for no config / personal / legacy / undefined tokenKind),
`tokenUpgradeBannerDismissal.test.ts` (dismiss persists, read-back). The hook/banner component
themselves are intentionally left untested, matching this codebase's existing convention of testing
the pure logic behind a banner (e.g. `chooseOfflineAlert.test.ts`) rather than the React
hook/component wiring it up (`useOfflineAlert.ts`/`OfflineAlertBanner.tsx` have no test files
either).

`npx tsc --noEmit`: clean. `npx jest --silent --testPathIgnorePatterns="node_modules"`: 1828 passed,
18 skipped, 1 pre-existing failure in `runner/shims/shims.test.ts` (`WebSocketServer is not a
constructor`, unrelated to this change — ignored per instruction).

## Not migrated yet, and why that's safe

- Every phone that has already paired (Sean's, Leah's) is still on the shared token after this
  change ships — by design. They will see the one-time upgrade banner on the Devices tab and can
  re-pair whenever they choose; nothing about their current session, saved devices, or working
  connection changes until they do.
- The banner's copy and placement were not run past Sean before writing (ADR-GLOBAL-002 would
  normally call for that on a wording/UX choice with any real ambiguity) — this one was treated as
  low-stakes/reversible (a dismissible line of text with an existing action button), consistent with
  ADR-HEARTH-160's own precedent of deciding small UX specifics without asking first and recording
  the reasoning here instead. Flag if the wording should change.
