# ADR-HEARTH-200: Default All On/Off Activities, and Assist dictation

**Date:** 2026-09-28
**Status:** Accepted (item 1 built; item 2 confirmed already working, no code needed)

## Context

ADR-HEARTH-199's roadmap named two Size S/M items: a default "All on"/"All off" Activity offered at
setup (the one baseline every hub-based competitor ships that Hearth didn't generate on its own),
and voice dictation into the Home Assistant Assist text box via iOS's own keyboard rather than a new
speech SDK.

## Decision 1: default "All On" / "All Off" Activities, offered once

- **Generator** (`src/core/activities/defaultActivities.ts`, pure, no React): `powerOnCapabilityFor`/
  `powerOffCapabilityFor` pick a device's direction-specific capability (`powerOn`/`powerOff`) when
  it declares one, else fall back to the shared `power` toggle, else `null` -- the same
  capability-by-capability precedence `activityChoices.ts`'s `commandChoicesFor` already uses.
  `powerCapableDevices` filters to devices controllable in either direction.
  `shouldOfferDefaultActivities` requires at least `MIN_DEVICES_FOR_DEFAULT_ACTIVITIES` (2) such
  devices and that no existing Activity's name already reads as "All On" or "All Off"
  (`looksLikeAllOnActivity`/`looksLikeAllOffActivity`: case-insensitive substring match, so a
  household's own renamed or qualified copy, e.g. "All Off (Movie Room)", still counts). `2` was
  chosen at the low end of ADR-199's stated "2-3" range because the offer is a dismissible one-time
  nudge, not a forced action, and showing it a little early costs nothing.
- **Steps:** `buildAllOnActivity` builds one command step per capable device, in device-list order
  (no cross-brand receiver/streamer ordering exists anywhere else in this codebase to defer to, so
  device-list order is the documented fallback the task called for). `buildAllOffActivity` builds
  the reverse -- last device on, first device off, mirroring a real hub's shutdown sequence. Both go
  through `activityStepEditing.ts`'s existing `newActivityDraft` (version 0, `onFail` left unset,
  the same "keep going on failure" default a hand-built step gets), so nothing about the resulting
  Activity is special: it is fully editable and deletable like any other from the moment it's
  created, and reaches the Pi through the same `useActivities.saveActivity` -> `activityLocalState`
  -> `activitySync` path (ADR-HEARTH-150, ADR-172/schedules-compatible) as an Activity built by hand
  in the editor.
- **Offer UI:** `useDefaultActivitiesOffer.ts` (per-phone dismissal via
  `src/runtime/defaultActivitiesOfferDismissal.ts`, an AsyncStorage flag mirroring
  `tokenUpgradeBannerDismissed`) and `DefaultActivitiesOfferCard.tsx`, a dismissible card in
  `DeviceListScreen.tsx`'s Activities area (styled like `FirstRunSetupCard`/`TokenUpgradeBanner`).
  Tapping "Create Activities" builds both drafts (two ids derived from one `newActivityId()` call
  plus `-on`/`-off` suffixes, since that generator returns the same value if called twice in the
  same millisecond) and saves them through `DevicesTabScreen`'s new
  `onGenerateDefaultActivities` prop, which calls `activities.saveActivity` twice.
- **No duplication on regenerate:** the name check in `shouldOfferDefaultActivities` is the primary
  guard (household-wide, since it reads the synced Activities list, not a per-phone flag) --
  once either Activity exists, from any phone, the offer stops everywhere. The per-phone dismissal
  flag only covers a household member explicitly declining without generating anything.
- **No new capability ids:** only `power`/`powerOn`/`powerOff`, already declared by existing drivers.

## Decision 2: Assist dictation needs no code change

Checked `HomeAssistantAssistScreen.tsx`'s question field: it is a plain React Native `TextInput`,
not `ThemedKeyboard.tsx` (the custom on-screen keyboard ADR-HEARTH-025 built specifically for
`AddSonyDeviceScreen`'s PSK field -- the only screen in this codebase that replaces the system
keyboard). No `keyboardType`, `secureTextEntry`, or `showSoftInputOnFocus` prop disables or replaces
the system keyboard either. iOS's default keyboard already shows its own dictation mic button for a
plain text field with no code from Hearth needed -- there is nothing here to build. A one-line
comment was added at the TextInput noting this so a future change (e.g. a numeric `keyboardType` or
swapping in a custom keyboard) doesn't silently take the mic away again.

No new native dependency (a real speech-to-text SDK) was added or needed, per ADR-199's own
"without needing OS-level assistant access" framing and this task's explicit instruction not to add
one.

## Consequences

- Two new small modules (`defaultActivities.ts`, `defaultActivitiesOfferDismissal.ts`), a hook
  (`useDefaultActivitiesOffer.ts`) and a card component, all additive; `DeviceListScreen.tsx` and
  `DevicesTabScreen.tsx` gained new props/wiring only, no existing behavior changed.
  `UniversalTvRemote.tsx` and the persistence/reconnect files other in-flight sessions were touching
  were left untouched, per this task's own scoping.
- `scripts/ui-verify/scenarios.mjs` gained `default-activities-offer` and
  `default-activities-generated` (screenshots reviewed: the card renders on the default fixture,
  survives one tap into two new "All On"/"All Off" chips, and disappears once generated).
