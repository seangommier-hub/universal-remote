# ADR-HEARTH-194: A "Now" summary view on the Devices tab

Date: 2026-09-28
Status: Accepted
Extends: ADR-HEARTH-162 (Track A item 10: an auto-generated "Now" home screen); reuses ADR-HEARTH-193's grouped-list model and StateStore/CommandEngine, adds nothing new to either.

## Context

ADR-HEARTH-162's roadmap calls for an auto-generated "Now" home screen -- a summary, not a dashboard
editor. This is that summary: a compact view of the Devices tab showing only devices that are
currently on or doing something, each with a one-line status and a one-tap Off button, reading live
`StateStore` data the grouped list already renders. No new polling, no new capability ids, no second
source of truth.

## Decisions

1. **Reachable as a switch, not a new tab.** A small "All | Now" segmented switch (`NowViewSwitch.tsx`,
   same look as `GroupBySwitch`) sits next to the existing Group-by switch on the "Connected Devices"
   label row. Selecting "Now" swaps `DeviceListSections` for the new `NowSummaryList`; the Group-by
   switch itself only makes sense in "All" mode and is hidden while "Now" is selected. The grouped list
   is untouched -- this is additive.
2. **"On" is decided by a pure predicate, not a new state field.** `isDeviceOn` (`src/ui/nowSummary.ts`)
   is true when a device: is not an excluded category (camera, sensor, action -- nothing to turn off),
   has an Off action at all (`capabilities` includes `powerOff` or `power`), is currently `connected`
   (a disconnected device's last-known values are never trusted here), and either `values.power === "on"`
   or `values.playbackState` is `"playing"`/`"paused"`.
3. **The Off button sends `powerOff` when the device has it, else the toggle `power`** -- the same
   precedence `UniversalTvRemote.tsx`'s own power button already uses (ADR-HEARTH-133); safe here
   specifically because every row shown is already known to be on.
4. **The status line reuses `resolveTitle`** (ADR-HEARTH-093, `useNowPlaying.ts`) while playing/paused
   ("Netflix", "Netflix (paused)", or the generic "Playing"/"Paused" when no app name is known), and is
   the plain "On" otherwise. Same source of truth the existing Now Playing widget already reads, not a
   second title-resolution path.
5. **Row order follows the grouped list's own section order** (`model.sections` flattened), not a
   separate sort -- Now reads as a filtered subset of the familiar list in Type or Room mode alike,
   never a re-shuffled one.
6. **Kid mode and guest mode get the same switch.** `KidDeviceListScreen.tsx` and
   `GuestDeviceListScreen.tsx` each already build their own restricted `DeviceListModel` via
   `useDeviceLayout`'s kid/guest filters; the Now view is layered on top of that same model in both, so
   a restricted phone only ever sees Now rows for devices it's already allowed to control. Reused,
   not reimplemented.
7. **Structure (ADR-GLOBAL-003).** New: `nowSummary.ts` (pure "on"/status/off-capability logic, unit
   tested), `useNowSummary.ts` (the live StateStore-subscribing hook), `NowViewSwitch.tsx` (the toggle),
   `NowSummaryList.tsx` (rows + empty state). `DeviceListScreen.tsx`, `KidDeviceListScreen.tsx` and
   `GuestDeviceListScreen.tsx` each only gained a few lines wiring these in.
8. **Verification.** `src/ui/nowSummary.test.ts` covers the predicate, the off-capability precedence,
   and the status-line formatting directly. Web harness: `devices-now` (the `household=types&layout=types`
   fixture switched to Now -- a realistic mix across TVs & Streaming, Lights, Plugs & Outlets and
   Climate & Fans, with Audio/Cameras/Gaming/Vacuums/Covers/Sensors/Actions correctly empty) and
   `devices-now-empty` (the same fixture, tapping every row's real Off button through CommandEngine
   until the calm empty state shows -- exercises the Off button and the empty state together instead of
   needing a second fixture).

## Questions decided inside the task brief (ADR-GLOBAL-002)

The task brief left several calls to the implementer ("your call") or left them genuinely ambiguous;
decided here, logged per ADR-GLOBAL-002, Sean can overrule any of them:

- **A device with no `power`/`powerOff` capability at all never appears in Now, even if it's audibly
  doing something.** Sonos speakers (no power capability exists on the local `node-sonos-http-api`
  surface this driver uses -- see `SonosDriver.ts`'s own comment) are the concrete case: a Sonos
  actively playing music does not show in Now, because there is nothing for a one-tap Off button to
  send. The brief's own wording ("a one-tap Off button per row") reads as a per-row guarantee, not an
  optional extra, so a row with no working button would misrepresent the feature more than omitting it.
  Same reasoning silently excludes vacuums (`vacuumStop`/`vacuumDock`, not `power`), locks, covers,
  and alarm panels, and gaming consoles that only ever declare `powerOn` (PS5, Xbox -- no read-back, no
  off path). Placement: `sectionLabelRow`/`sectionControls`'s toggle sits beside the Group-by switch on
  the owner's screen (the brief's own suggested option); the kid/guest screens have no such label row,
  so their switch sits right-aligned above the list instead.
- **A disconnected device is never shown, even mid-reconnect with stale "on" values in the StateStore.**
  Chosen over trusting the last-known value, to keep the calm-empty-state and never-show-an-error goals
  (ADR-HEARTH-162 item 1) honest -- Now would otherwise offer an Off button that fails.
- **Paused counts as "on".** A device paused mid-show is still doing something a person would want
  surfaced and stoppable, matching `useNowPlaying`'s own existing choice to include paused devices in
  the home screen's Now Playing widget.
- **Switch labels are "All" / "Now", not "Devices" / "Now".** The bottom tab bar already has a
  "Devices" tab visible on the same screen; reusing that word for the in-tab switch would read as two
  different things sharing one label.

## Consequences

- The Devices tab gains one more per-phone view toggle (not persisted -- it resets to "All" on
  relaunch, since it's a momentary lens on live state, not a layout choice like Group-by).
- A household with only Sonos/vacuum/lock/cover/PS5-class devices on will show a Now view that never
  populates even while those devices are genuinely active -- a real, acknowledged gap tied to what this
  codebase's drivers expose today, not a bug in the predicate.
- Favorites, GroupBySwitch persistence, long-press menu, remote pages, and every existing scenario's
  screenshot are unchanged.
