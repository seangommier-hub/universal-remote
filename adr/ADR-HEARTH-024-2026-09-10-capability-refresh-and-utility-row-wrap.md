# ADR-HEARTH-024: Refresh stale capabilities on load; wrap the utility row

**Date:** 2026-09-10
**Status:** Accepted

## Context

Sean, after the streaming-shortcuts build (ADR-HEARTH-023) and
Settings/Sleep Timer (ADR-HEARTH-022) shipped: "what was sent and the
images i sent you look nothing alike, the settings and sleep timer
overlap and there are no buttons for streaming and other services."

Traced two separate real causes rather than assuming the new code was
simply wrong:

1. **Missing streaming buttons**: `device.capabilities` is set exactly
   once, at pairing time (`capabilities: driver.getCapabilities()` in
   `AddLgDeviceScreen.tsx` and its three siblings), then persisted as-is.
   Sean's LG device was paired earlier this same session, before
   `launchApp` existed on `LG_CAPABILITIES`. Nothing ever re-synced the
   persisted device's capability list against the driver's current one —
   so `has(device, "launchApp")` was false for his already-paired device
   even though the driver and UI code were both correct. This wasn't a
   bug in the streaming-apps feature itself; it was a gap in how an
   existing device picks up a driver's newly-added capabilities at all.
2. **Utility row overlap**: real, and self-inflicted by the previous two
   ADRs. `utilityRow`'s gap was `spacing.xl` (24) with no wrap, sized
   around the original 4-item case (mute/back/home/menu). Samsung can now
   show 6 (adding settings/sleepTimer) — 6×52px circles alone is 312px,
   already past a 375pt screen's available width (311px, per the same
   arithmetic ADR-HEARTH-016 used for the hub row) before a single gap is
   counted. With no `flexWrap`, React Native doesn't shrink or wrap
   overflowing row content — it spills past the card's bounds into
   whatever renders next, reading as "overlap."

## Decision

- **Capability refresh**: new `refreshCapabilities(device)` in `App.tsx`,
  called synchronously for every persisted device at startup, right
  before `deviceRegistry.add()`/`attachStateBridge()`. Sets
  `device.capabilities = driver.getCapabilities()` unconditionally —
  capabilities are a pure function of the driver, not the live
  connection, so this doesn't need to wait on (or depend on the success
  of) `connect()`. Freshly-paired devices already get a correct list from
  the Add-device screens, so this only needed wiring at the startup-load
  path.
- **Utility row**: `flexWrap: "wrap"` added, gap reduced from
  `spacing.xl` to `spacing.md`. A row that grows past whatever count it
  was last sized for now folds onto a second line instead of overflowing
  — general protection against the same class of bug recurring the next
  time a capability is added to this row, not just a fix sized to
  exactly 6 items.

## Rationale

The capability-refresh fix is UI-layer (`App.tsx`), not duplicated into
each of the four drivers — capability lists are static, synchronous data
already fully described by `driver.getCapabilities()`, so there's nothing
driver-specific about syncing them; one call site covers every driver.
Persisting the refreshed list back to disk isn't necessary — it's fully
re-derived from code on every load, so it's correct by construction the
next time regardless.

`flexWrap` over further gap-tuning for the utility row specifically:
gap-tuning fixes today's exact item count and reintroduces the identical
bug the next time a capability is added to this row (Sony/Samsung both
have room to grow further). Wrap is the version of this fix that doesn't
need revisiting again.

## Consequences

- 109/109 tests passing (no new test — `refreshCapabilities` is a
  one-line closure inside `App.tsx`, which has no test file by this
  project's established convention, same as every other `App.tsx`
  change this session), `tsc --noEmit` clean.
- A device's capability list is now always current as of the last app
  launch, not frozen at pairing time — this generalizes past today's
  specific miss (streaming shortcuts) to any future driver capability
  addition.
- Not yet re-verified on Sean's real device — same outstanding caveat as
  every UI fix this session.
