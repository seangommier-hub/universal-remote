# ADR-HEARTH-208: Layout pass from the visual sweep (Settings length, button rows, gutters, header)

Date: 2026-10-05
Status: Accepted
Follows: ADR-HEARTH-207

## Context
Sean, 2026-10-05: "use the visual agent ... because spacing/padding is way off as well as layout."
A read-only visual agent swept the Android emulator (HearthTest AVD, live household data) and the
ui-verify web harness, measuring with `uiautomator` bounds. It found no crash. These are its
measured layout findings, worst first, and what was done about each.

## Decisions
1. **Settings was about 10 phone-heights long.** Recent activity rendered all ~50 lines inline,
   burying Devices to share and Bump.
   - Now shows the newest 8, with "Show all N" / "Show fewer" next to Refresh
     (`core/activityLog/visibleActivity.ts`, tested). Nothing is removed; the rest is one tap away.
2. **Mismatched buttons.**
   - Cancel/Save were 212px and 176px content-sized pills, centred above full-width buttons. They
     now split the row evenly (`flex: 1`).
   - The space around that row was 32dp above and 8dp below; it is now 20 and 16.
   - The invite card's "Create invite code" and "Share invite" were 414px pills centred in the
     card. They are now full width like every other Settings button.
3. **Three different side margins.** Devices and Settings use 24dp and Feeder used 16dp. Feeder
   now uses 24dp (`spacing.xl`).
   - The remote screen's tighter 16dp edge is deliberate and stays: at 24dp the
     Vol/D-pad/Ch row clips on a 375pt iPhone, as documented in UniversalTvRemote.tsx.
4. **Devices header: the "Away" badge touched the trackpad icon** (it ended at x609, the icon
   started at x608). `adjustsFontSizeToFit` is iOS-only, so on Android the title never shrank and
   the badge spilled out of `headerText`. The title now gets `flexShrink: 1` and the badge
   `flexShrink: 0`.
5. **The remote's Back chevron was a 38px tap target** (a 22px glyph with 8px slop). The slop is
   now 12px, giving 46px, above the 44pt minimum.
6. **Household remotes and Household phones drew two lines** above the next section: the last
   row's bottom border plus the section divider. The last row no longer has a border.
7. **Household phones showed an empty list with no explanation.** Every phone is still on the
   legacy shared token, so none has a per-phone record, which is correct data. It now says so and
   points to Re-pair.
8. **"Join with a code" Cancel went all the way to the Devices list** when it was opened from
   Settings. It now returns to Settings.

## Not changed
- The remote screen's ~570px of empty space below its last row, and the shrunk "HDMI 3
  (eARC/ARC)" label. These are remote-layout redesign territory (ADR-HEARTH-016/205), not a quick
  fix.
- The Expo Go "Tools" gear and dev warning toasts overlapping content. These are dev-client only
  and never appear in the installed app.

## Verification
- Typecheck is clean.
- Jest: 198 suites and 2,316 tests pass.
- Checked on the emulator: Cancel/Save are equal width and fill the row, the invite button is full
  width, and Recent activity shows 8 entries with "Show all 50" and Refresh.
