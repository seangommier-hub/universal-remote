# ADR-HEARTH-222: passive "N new devices found" indicator

## Status

Accepted

## Context

Sean (2026-10-08): "continue working on the items that home assistant and other apps can do" for
device addition. ADR-HEARTH-221 listed a passive "N new devices found" badge as a next candidate:
Home Assistant raises a "Discovered" notification so people notice new devices without opening the
add screen, and never completes a discovery on its own (the person always confirms).

What Hearth already shows: the Devices list has "Suggested From Your Network" (top 3 ready-to-add
devices, ADR-092/148/153) and a full Discover screen. Both only scan while they are open (plus a
throttled foreground rescan while the list is mounted, ADR-167). Gaps:

- Nothing is visible from another screen or tab (a remote, the Feeder tab).
- On the list, Suggested sits below Connected Devices, usually off screen.
- Suggested has no memory: it shows the same devices forever, so it cannot say "new".

## Decision

Two surfaces, one count. The count is the devices the Discover screen would list under "Ready to
add" (`buildSections(...).ready`: recognized, online, not already added, not hidden) minus the ones
the person was already told about (`findNewDevices`).

- **Badge on the Devices tab** (accent colour, not alarm red): the part that is new, because it shows
  from any screen. Screen readers hear "Devices, N new devices found".
- **One-line banner at the top of the Devices list**, styled like `OfflineAlertBanner`: "N new devices
  found on your network", with Review (opens Discover) and a dismiss X. It is a nudge toward
  Suggested/Discover and does not repeat their rows or offer an Add button. It is announced to
  VoiceOver and is a TalkBack live region, like the offline banner (ADR-180).
- **Told = remembered per device.** Dismissing the banner, or opening Discover by any route, marks the
  devices counted at that moment as told. Key is `labelKey` (MAC, else address), so a changed address
  does not make an old device "new" again. A device that appears later, or is un-hidden or newly
  recognized, counts again.
- Never adds anything. Review only navigates; adding still goes through the existing confirm flows.
- Off for kid and guest phones (nothing they can add).

### Scanning: no second scanner, bounded cost

- `scanSnapshot.ts` holds the newest successful scan. `useNetworkDevices` (Suggested, Discover) now
  routes through one `scanNetwork()` that counts the scan as in flight and publishes its result when
  the Pi was reachable. The indicator reads that snapshot; the list and Discover scans already
  happening feed it for free.
- When no list is mounted (person is on a remote or the Feeder tab), the indicator may run its own
  quiet scan with the existing `scanNetworkQuietly`, but only when ALL hold: Family Command Center is
  configured, no scan is in flight, the last snapshot is at least 10 minutes old (or absent). It checks
  on mount, on return to the foreground, and every 10 minutes while the app is open and foregrounded,
  each time after a 4 s delay so a screen that is about to scan itself starts first and the two never
  overlap. Worst case is one extra `discover/all` call per 10 minutes.
- The existing 15 s foreground throttle (ADR-167) is unchanged.

## Questions and answers (ADR-GLOBAL-002)

- Q: store "told" in the device labels like hidden? A: No, a separate key `hearth.discover.noticed`.
  Labels are saved whole by every `useDeviceLabels` instance and shared with the Pi; this indicator is
  always mounted next to Suggested, so a stale copy could overwrite a hide. "Seen" is also per phone,
  not household. Capped at 500 keys, oldest dropped.
- Q: should opening Discover count as seen? A: Yes. Otherwise a person who looked and chose not to add
  would see the badge forever, which is nagging. Hiding in Discover is separate and handled by the
  labels (labels are re-read when the screen changes).
- Q: count offline recognized devices? A: No, same as Suggested's "Ready to add"; they cannot be added
  right now.
- Decided without asking Sean (low-risk, reversible): accent badge colour, 10 minute interval.

## Consequences

- New files: `scanSnapshot.ts`, `noticedDevices.ts`, `newDeviceAlert.ts` (pure, with tests),
  `useNewDevices.ts`, `useDevicesTabBadge.ts`, `NewDevicesBanner.tsx`.
- Tests: `scanSnapshot.test.ts` (10), `noticedDevices.test.ts` (9), `newDeviceAlert.test.ts` (12).
- ui-verify scenarios: `new-devices-banner`, `new-devices-dismissed`, `new-devices-badge-on-remote`
  (the last proves the quiet scan runs when no list is mounted). Checked at 375x667, 393x852, 430x932:
  banner and badge neither overlap nor clip anything.
- The household Pi's label endpoint is untouched.

## Next candidates (not built)

Room chips on the bulk-add summary card; a one-tap "re-pair" prompt when a saved LG/Samsung key is
rejected (Home Assistant's reauth); an OS notification for new devices (needs background scanning and
a permission, deliberately not done here).
