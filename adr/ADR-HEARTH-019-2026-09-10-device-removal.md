# ADR-HEARTH-019: Device removal (long-press to unpair)

**Date:** 2026-09-10
**Status:** Accepted

## Context

Found during a proactive review pass (continuing under Sean's "keep
working, do not stop unless there is a legal reason to" directive):
`persistence.ts`'s `removeDevice()` and `DeviceRegistry.remove()` were
both fully implemented and tested, but neither was ever called from
anywhere in the app. There was no UI path to unpair a device once added —
a mistyped IP address, a device that gets replaced, or wanting to re-pair
after a config change all had no recovery short of clearing the app's
entire storage.

This is a real gap that was going to bite Sean specifically during this
same session's real-device testing: several IP-address pairing attempts
already happened this session, and a wrong one would have been permanent
until now.

## Decision

Added a long-press gesture on a device card in `DeviceListScreen` that
opens a native confirm dialog (`Alert.alert`, "Remove device?" /
Cancel / Remove-destructive) before calling a new `onRemove` prop.
`App.tsx`'s `handleRemoveDevice`:
1. Best-effort `driver.disconnect(device)` — wrapped in try/catch, logged
   and swallowed on failure, since a device that's already unreachable
   (the exact case someone is most likely removing) shouldn't be able to
   block its own removal.
2. `deviceRegistry.remove()` + `setDevices()` — updates the in-memory list
   and UI immediately.
3. `persistence.removeDevice()` — fire-and-forget with a logged warning on
   failure, matching `handleDeviceAdded`'s existing `saveDevice()` pattern
   exactly (same file, same shape, for consistency).

Also fixed a stale doc comment on `DeviceRegistry` that still said
"persistence is a later roadmap item" — it isn't; `persistence.ts` has
been live and wired into `App.tsx` since earlier this session.

## Rationale

A long-press with a confirm dialog (rather than, say, a swipe action)
matches the existing interaction vocabulary of this screen (`onSelect` is
already a tap) without adding a visible delete icon to every row, which
would clutter a screen this session already worked to keep dense and
uncluttered. The confirm step exists because removal isn't reversible
from this screen — the device has to be paired again from scratch,
including a fresh on-screen TV approval for LG/Samsung.

Disconnecting before removing (rather than after, or not at all) matters
specifically because of this same session's reconnect work
(ADR-HEARTH-017): a device that's mid-backoff-retry when removed needs
that loop actually stopped, not just its registry entry deleted out from
under it — `disconnect()` on every driver already clears its own
reconnect timer and bumps its generation counter for exactly this reason.

## Consequences

- 97/97 tests passing (no new test — `DeviceListScreen`/`App.tsx` have no
  component-level tests by this project's established convention, same as
  every other screen), `tsc --noEmit` clean.
- Still unverified in Expo Go on a real device — same outstanding caveat
  as the rest of the UI work this session.
- If a swipe-to-delete or an explicit trash icon is wanted later instead
  of long-press, that's a presentation-layer change only — `onRemove` and
  `handleRemoveDevice` don't assume how they're triggered.
