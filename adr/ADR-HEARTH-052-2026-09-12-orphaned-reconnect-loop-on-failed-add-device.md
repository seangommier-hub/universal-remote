# ADR-HEARTH-052: Failed "Add Device" attempts orphan a permanent background reconnect loop

Date: 2026-09-12

## Status

Accepted.

## Context

First-ever live-hardware test of the new play/pause feature ([[ADR-HEARTH-051]]), run against the
real Downstairs Living Room LG TV via a freshly-built Android emulator (see the emulator-setup work
this same night). Sequence: tapped Connect on the manual "Add LG TV" form before Family Command
Center was paired (expected failure, direct-only), cancelled out, paired Family Command Center, then
used Discover Devices and tapped Connect on the same physical TV (192.168.1.218) — which succeeded.

Live logcat during that second, successful attempt showed the driver retrying a connection to
`LG TV` (the *first*, cancelled, never-saved attempt's device name) on its own 30s backoff schedule
at the same time the second attempt was pairing, and the physical TV returned
`403 too many pairing requests` before the real connection finally landed.

Root cause, read directly from `LgWebOsDriver.ts`: `connect()` unconditionally calls
`scheduleReconnect(device)` in its `catch` block on *any* failure (ADR from 2026-09-10, correctly
fixing "a device that failed to connect never got auto-retried at all" for *saved* devices). But
`AddLgDeviceScreen.tsx` calls `driver.connect(device)` on a throwaway `Device` object
(`id: lg-${Date.now()}`) that is only ever kept if the connect succeeds (`onAdded(device)` runs
after). On failure, the screen shows an error and lets the user retry or cancel — but nothing ever
calls `driver.disconnect(device)` for that specific rejected id, so its reconnect loop runs forever,
unseen and unstoppable, against whatever IP the user typed. Retrying in the same screen makes it
worse: each attempt gets a fresh `Date.now()` id, so N failed attempts before a success leaves N
orphaned loops, all polling the same TV independently.

All seven "Add Device" screens (`AddLgDeviceScreen`, `AddSamsungDeviceScreen`, `AddSonyDeviceScreen`,
`AddRokuDeviceScreen`, `AddHueDeviceScreen`, `AddSmartThingsOutletsScreen`, `DiscoverDevicesScreen`)
call `driver.connect(device)` on a not-yet-saved device with the identical discard-on-failure
pattern — not yet confirmed whether every one of their underlying drivers implements the same
auto-reconnect-on-failure behavior (Hue/SmartThings are not LAN-socket TV drivers and may not), but
the UI-level leak (never disconnecting a rejected provisional device) is the same code shape in all
seven and needs checking case by case.

## Decision

`AddLgDeviceScreen.handleConnect`'s failure path now calls `driver.disconnect(device)` (swallowing
its own rejection) immediately after recording the error, so the throwaway device's reconnect timer
is cancelled the moment this screen stops being the thing tracking it.

Checking and applying the same fix to the other six Add-Device screens — where their underlying
driver actually has a reconnect-on-failure loop to leak in the first place — is scoped as a
follow-up, not bundled into this ADR.

## Consequences

- A user who mistypes an IP, tries before Family Command Center is paired, or just cancels out of
  adding an LG TV no longer leaves a permanent, invisible background retry loop hammering that IP.
- Directly explains tonight's live `403 too many pairing requests` — confirms it was this app's own
  bug, not LG rate-limiting a legitimate single reconnect sequence.
- Verified live: after this fix, the pattern that produced the 403 (two independent loops against
  the same IP) can no longer occur, since the failed first attempt is torn down before the second
  begins. Not yet re-tested against real hardware end-to-end (would require re-triggering the exact
  fail-then-retry sequence live again).
- Same audit/fix still owed for Samsung, Sony, Roku, Hue, SmartThings, and DiscoverDevicesScreen.

## Related

[[ADR-HEARTH-051]], LgWebOsDriver.ts reconnect-on-failure decision (2026-09-10, uncited ADR number),
[[ADR-HEARTH-047]]

## Update 2026-09-12 (later, same night): audited and fixed the other six Add-Device screens

Followed through on this ADR's own "checking and applying the same fix to the other six Add-Device
screens ... is scoped as a follow-up" — audited each of `AddSamsungDeviceScreen.tsx`,
`AddSonyDeviceScreen.tsx`, `AddRokuDeviceScreen.tsx`, `AddHueDeviceScreen.tsx`,
`AddSmartThingsOutletsScreen.tsx`, and `DiscoverDevicesScreen.tsx` against their underlying
driver's actual `connect()` failure path, case by case rather than assuming the LG shape applies
uniformly.

**Fixed (driver confirmed to have the same unconditional reconnect-on-failure loop as
`LgWebOsDriver`):**

- `AddSamsungDeviceScreen.tsx` — `SamsungTizenDriver.connect()`'s `catch` calls
  `this.scheduleReconnect(device)` unconditionally on any failure (`SamsungTizenDriver.ts` line
  ~171), identical shape to LG's. Added `driver.disconnect(device).catch(() => {})` in the screen's
  `catch` block.
- `AddRokuDeviceScreen.tsx` — `RokuEcpDriver.connect()`'s `doConnect()` `catch` calls
  `this.scheduleReconnect(device)` unconditionally on any failure (`RokuEcpDriver.ts` line ~150).
  Same fix applied.
- `AddSonyDeviceScreen.tsx` — less obvious than the other two: `SonyBraviaDriver.connect()` itself
  has no `catch`, but its `doConnect()` calls `refreshState()`, whose own `catch` calls
  `this.scheduleReconnect(device)` unconditionally before rethrowing (`SonyBraviaDriver.ts` line
  ~276) — same end effect (a failed `connect()` leaves a live reconnect timer keyed to the
  throwaway `sony-${Date.now()}` device id), just one call frame deeper. Same fix applied.
- `DiscoverDevicesScreen.tsx` — generic across whatever `driverId` the Family Command Center
  reported, so it can hand a throwaway device to any of LG/Samsung/Sony/Roku (all confirmed above
  to leak) or Hue/SmartThings (confirmed below not to). Applied the fix unconditionally in its one
  shared `catch` block — calling `disconnect()` on a Hue or SmartThings device here is a harmless
  no-op (see below), so there is no need to special-case by driver type.

**Checked, not fixed (driver has no persistent reconnect loop — nothing to leak):**

- `AddHueDeviceScreen.tsx` — `HueLightDriver.connect()` only calls `readLightState()` (a single
  bridge HTTP round-trip) and, on failure, one bounded re-discovery retry before setting
  `disconnected` state and rethrowing. No `setTimeout`/`scheduleReconnect`/reconnect-timer map
  anywhere in `HueLightDriver.ts` — confirmed by grep and by the file's own header comment ("No
  reconnect backoff like the TV drivers: Hue's API is stateless per-request HTTP with no persistent
  connection to lose"). A failed pairing attempt here has no background loop to orphan.
- `AddSmartThingsOutletsScreen.tsx` — `SmartThingsOutletDriver.connect()` is a single
  `listOutlets()` HTTP call against the Family Command Center's SmartThings proxy; on failure it
  just sets `disconnected` state and rethrows. No `setTimeout`/reconnect-timer map in
  `SmartThingsOutletDriver.ts` or `SmartThingsClient.ts`. Same conclusion as Hue: no persistent
  retry loop exists, so there is nothing for a discarded provisional device to leak.

**Verification**: `npm run typecheck` (`tsc --noEmit`) passes with no errors after all four edits.
No live-hardware retest performed (no device/emulator access in this pass) — this is a code-level
audit and fix based on the pattern already confirmed live for LG.

Not touched: `AddLgDeviceScreen.tsx` and `LgWebOsDriver.ts` (already fixed, this ADR's original
decision).
