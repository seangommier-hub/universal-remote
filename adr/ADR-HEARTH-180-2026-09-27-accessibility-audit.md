# ADR-HEARTH-180: Accessibility audit — VoiceOver/TalkBack, Dynamic Type, contrast

**Date:** 2026-09-27
**Status:** Accepted, implemented

## Context

ADR-HEARTH-158 (Tier 2, item 8) named "VoiceOver and Dynamic Type audit" as roadmap work. This is
that audit: every screen under `src/ui` (85 files), covering (1) VoiceOver/TalkBack labeling and
state, (2) Dynamic Type scaling and layout at larger text sizes, (3) WCAG AA color contrast in
`theme.ts`. An audit-and-fix pass, not a redesign — no visual design changed except where a
contrast or clipping failure required it.

## Method

- Manual read-through of every named target file (`UniversalTvRemote.tsx`, `CapabilityButton.tsx`,
  `DeviceListScreen.tsx`, `DevicesTabScreen.tsx`) plus a representative sample of the rest.
- A new static lint, `src/ui/accessibilityLint.test.ts`: scans every `.tsx` file under `src/ui` for
  a `Pressable`/`TouchableOpacity` whose only visible child is an `<Ionicons>` (no sibling `<Text>`)
  and asserts it carries a real `accessibilityLabel`. Not a full JSX parser — a pragmatic
  brace/string-aware tag scanner good enough for this codebase's own formatting. This did the
  exhaustive "every screen" pass no amount of manual reading could cover as reliably; across all 79
  scanned files it found exactly one violation (`UpdateBanner.tsx`, below).
- WCAG contrast: computed relative-luminance ratios for every `theme.ts` foreground/background pair
  actually used in the app (script-checked, not eyeballed).
- Dynamic Type: the app has no allowFontScaling anywhere disabled (checked — zero hits), so system
  text scaling already works everywhere. To spot-check *layout* at larger sizes, added a demo-only
  `?fontScale=` param (ADR-HEARTH-157's web harness) that scales `theme.type` in place, and ran the
  harness at 1.3x/1.6x on the remote screen and the Devices list, screenshotting both.
- This app has a single, fixed dark theme — no light variant exists (checked: no `useColorScheme`,
  `Appearance`, or second theme file anywhere), so the "light and dark themes" contrast check in
  scope is dark-only by construction, not a gap in this audit.

## Found and fixed

### VoiceOver/TalkBack

1. **Modal backdrop/card collapse (6 files) — the most serious finding.** `Pressable` defaults to
   `accessible: true` (confirmed in `node_modules/react-native/.../Pressable.js`), which collapses
   *every descendant* into one opaque VoiceOver/TalkBack node. Every option-menu modal in this app
   (`DeviceActionsModal`, the add-device picker in `DeviceListScreen`, `BrandPickerModal`,
   `RowActionsModal`, `KidModePinModal`, the sleep-timer picker in `UniversalTvRemote`) wraps its
   real content in `<Pressable style={backdrop}><Pressable style={card}>...real buttons...</Pressable></Pressable>`
   — both wrapping Pressables were swallowing every Option/Action row inside them, so a screen
   reader saw the *entire modal* as a single unlabeled button, with none of its real options
   individually reachable. Fixed by adding `accessible={false}` to both wrapping Pressables in all
   six files (their `onPress` — dismiss / stop-propagation — is untouched; `accessible` only affects
   the accessibility tree, not touch handling).
2. **`NowPlayingWidget` — same collapse bug, different shape.** The whole now-playing bar was one
   `Pressable` (onOpen) with the Back/Play-Pause/Home `CapabilityButton`s nested *inside* it as
   children — collapsing them into the bar's own "Now playing on X: Y" label, so none of the three
   playback controls were individually reachable. Restructured so the tap-to-open area (thumbnail +
   title/subtitle) is its own `Pressable`, a **sibling** of the controls row, not their parent.
3. **`UpdateBanner`'s dismiss ("×") button** had no `accessibilityRole`/`accessibilityLabel` — the
   one violation the new lint test found. Fixed (`role="button"`, `label="Dismiss"`).
4. **`DeviceSharePanel`'s per-device `Switch`** had no `accessibilityLabel` — next to the device's
   name as a sibling Text, not a combined label, so VoiceOver read "device name" then "switch, on"
   with no connection between them. Fixed: `accessibilityLabel={`Share ${device.name}`}`.
5. **`ScanFamilyCommandCenterQrScreen`'s two "enter manually" links** had no role/label. Fixed.
6. **Grouped controls / state:**
   - `CapabilityButton` gained an optional `selected` prop (forwarded to `accessibilityState`),
     now passed from the remote screen's Mute/Sleep/utility toggles and its input-selection tiles,
     so VoiceOver announces "selected" the same way the accent-colored variant reads to a sighted
     user. (`disabled` was already correct — `Pressable`'s own `disabled` prop auto-merges into
     `accessibilityState.disabled`, confirmed in the RN source; no change needed there.)
   - The remote screen's Remote/Keypad/Keyboard tab bar gained `accessibilityRole="tab"` +
     `accessibilityState={{selected}}` per tab (previously three unlabeled-as-tabs buttons with no
     way to tell which was active) and `accessibilityRole="tablist"` on the row.
   - The d-pad's Up/Down/Left/Right and the Vol/Ch rockers already had per-direction labels via
     `CapabilityButton`'s required `label` prop — no gap found there.
   - The utility row's caption `Text` (e.g. "Mute") duplicated the icon button's own
     `accessibilityLabel` right above it; hidden from the accessibility tree
     (`accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`) so it isn't
     announced twice per button.
   - `ThemedKeyboard`'s Shift key gained `accessibilityState={{selected: shift}}`.
7. **Status-only text / live regions:** the remote screen's connection-status pill and command-error
   banner, `OfflineAlertBanner`, `UpdateBanner`, and the QR-scan screen's error card now use
   `accessibilityLiveRegion` (TalkBack) plus an explicit `AccessibilityInfo.announceForAccessibility`
   call on the meaningful text changes (iOS VoiceOver; `accessibilityLiveRegion` alone is an
   Android-only mechanism in React Native, confirmed against the RN docs/source) — previously a
   status flip while the user wasn't looking at the screen (e.g. a TV dropping mid-use) had no way
   to reach a screen-reader user at all.
8. **`CommandCenterRemoteScreen`'s trackpad (documented limitation, not a full fix):** a free-form
   drag gesture has no real VoiceOver-compatible equivalent — when VoiceOver is on, iOS intercepts
   standard touch gestures for its own navigation, so the raw drag would never reach this surface's
   responder handlers at all. Added a label/hint pointing at the arrow-key keyboard (already a
   fully accessible, `CapabilityButton`-based alternative) rather than leaving an unlabeled, silently
   non-functional surface — but building a true VoiceOver-native cursor control is a real feature,
   not an audit-and-fix change, and is deferred.

### Dynamic Type

- No `allowFontScaling={false}` anywhere in `src` — system text scaling already reaches every
  screen; nothing to fix here.
- Added `?fontScale=` (demo-only; see `src/demo/demoFontScale.ts` and
  `demoFontScalePreload.ts`) to approximate larger accessibility text sizes in the web harness,
  since Playwright cannot emulate real iOS Dynamic Type. **Real gap found in the first
  implementation attempt:** mutating `theme.type` from a React effect (as `DemoGate`/
  `startDemoEnvironment` already did for other demo setup) was too late — every screen's own
  `StyleSheet.create` reads `theme.type.*` once, at module-evaluation time, which happens before
  any component ever mounts. Fixed by moving the scale application to a top-level statement in a
  module imported as `App.tsx`'s literal first import, which Metro/CommonJS evaluates before any
  later import's own `StyleSheet.create` runs. Verified this actually took effect afterward (the
  harness's own overflow measurement changed from identical-at-every-scale to genuinely growing
  with `fontScale`).
- **Remote screen (`remote-lg`): passes.** At the default text size it still fits with 1px to spare
  (ADR-HEARTH-135's own invariant, unchanged). At 1.3x it needs 34px of scroll; at 1.6x, 113px —
  both allowed per this audit's own scope ("larger sizes are allowed to need scrolling"). Screenshots
  reviewed at both scales: no clipped or overlapping text — long labels ("prime video", "NETFLIX")
  already shrink-to-fit or truncate gracefully via the existing `adjustsFontSizeToFit`/
  `numberOfLines` pattern; the utility row wraps to a second line as its own comment already
  anticipated.
- **Devices list (`devices-home`): one real clipping bug found and fixed.** At 1.6x scale the
  "Hearth" wordmark, squeezed by the fixed-size `ConnectivityBadge` and header icon buttons beside
  it, degraded from a plain `numberOfLines={1}` truncation into unreadable "H..." — not the
  "graceful ellipsis on a long device name" case this pattern is normally fine for, since "Hearth"
  is the app's own name, always the same short literal. Fixed with the same `adjustsFontSizeToFit`
  + `minimumFontScale` technique this codebase already uses for `StreamingAppTile` and
  `CapabilityButton`'s own `numberOfLines` path.
  - **Caveat, and why this fix is still correct despite the harness's own screenshot:** react-native-web
    does not implement `adjustsFontSizeToFit` (confirmed: the screenshot after this fix still shows
    "H." on web), so the harness cannot visually verify this specific fix — it's a native-only Text
    feature, and this is the same "what web cannot verify" caveat ADR-HEARTH-157 already documents
    for real SF font metrics. The code change is real and matches an established, already-shipped
    pattern in this same codebase; it should be spot-checked on a real device/simulator at a large
    Dynamic Type setting, not re-verified through this web harness.
  - The Devices list is a scrolling `ScrollView` by design at every text size (not subject to the
    remote screen's own no-scroll invariant) — the large `overflow` numbers reported for this
    scenario are expected, not a regression.

### Color contrast (WCAG AA, `theme.ts` — single dark theme, no light variant exists)

Computed contrast ratios for every foreground/background pair actually used in the app:

| Pair | Ratio | Needs | Result |
|---|---|---|---|
| textPrimary / background, surface, surfaceRaised | 12.5–16.3:1 | 4.5:1 | Pass |
| textSecondary / background, surface, surfaceRaised | 4.93–6.42:1 | 4.5:1 | Pass |
| **textTertiary / background, surface, surfaceRaised** | **2.41–3.14:1** | **4.5:1** | **Fail — fixed** |
| background-on-accentEnd (button label) | 7.11:1 | 4.5:1 | Pass |
| statusError / background, surface | 5.84–6.62:1 | 4.5:1 | Pass |
| statusOn icon / surfaceRaised | 7.92:1 | 3:1 (icon) | Pass |
| accentEnd icon / background, surfaceRaised | 5.46–7.11:1 | 3:1 (icon) | Pass |
| accentStart / background | 11.96:1 | 4.5:1 | Pass |
| border / background (card separator) | 1.51:1 | 3:1 (non-text UI) | **Fail — deferred** |

**Fixed:** `theme.textTertiary` (`#5C6480`) failed AA against all three surfaces it's actually used
against for real informational text — device-meta lines (`headerDivider`/`deviceMeta` on the remote
screens), `RecentActivityList`'s log entries, `PostAddChecklist`'s caption row, activity-step option
text, and more (30+ call sites via the one shared token). Changed to `#8A93C4`, in the same cool
navy-gray family, chosen against the worst case (`surfaceRaised`, the lightest of the three
surfaces and hardest to contrast against for a lighter foreground): 4.74:1 there, 5.44:1 on
`surface`, 6.17:1 on `background`. `theme.statusOff` (same old hex, a status *dot* color, always
paired with its own text label elsewhere) was deliberately left alone — a decorative/redundant
color indicator, not the token failing here.

**Deferred, documented, not fixed:** `theme.border` (`#2E3549`) against `background` measures
1.51:1, short of WCAG 1.4.11's 3:1 for a UI component boundary. In practice every card/input using
it also sits on a distinct `surface`/`surfaceRaised` tonal step (ADR-HEARTH-009's own elevation
ladder), so the border is reinforcing an already-visible boundary, not the sole way to perceive it,
which is the condition 1.4.11 actually gates on — but this wasn't verified per-component (an input
field's border arguably is closer to "the only way to see its bounds" than a card's). Flagged here
rather than changed, since a border-color change is a visual-design decision touching dozens of
files' shared surface treatment, past this pass's audit-and-fix scope; would need its own decision
if pursued.

## Not changed / out of scope

- No visual redesign — only the two clipping/contrast fixes above changed how anything looks, and
  both are minimal, established-pattern changes (shrink-to-fit text, one token's hex value).
- `CommandCenterRemoteScreen`'s trackpad drag gesture itself (see above) — labeled, not rebuilt.
- `theme.border` contrast (see above).
- A full per-screen manual VoiceOver pass on a real device — this audit is static (source-level
  props/state, a lint test, computed contrast ratios, and the web harness's DOM-level overflow
  measurement); it did not run inside actual VoiceOver/TalkBack. Recommend a real-device spot check
  before considering this fully closed, particularly for the trackpad and the `adjustsFontSizeToFit`
  Dynamic Type fixes the web harness cannot itself verify.

## Tests

- `src/ui/accessibilityLint.test.ts` (new): the icon-only-Pressable-without-a-label static check
  described above, run against every `.tsx` file under `src/ui` via `it.each`. Passes clean now
  (`UpdateBanner`'s violation fixed); will fail on any future icon-only Pressable/TouchableOpacity
  that ships without a label.
- `npx tsc --noEmit`: clean.
- `npx jest --silent --testPathIgnorePatterns="node_modules"`: 1927 passed, 18 skipped, one
  pre-existing unrelated failure (`runner/shims/shims.test.ts`, a `ws` module-resolution error in
  this dev sandbox, nothing to do with this change — the task's own instructions named this file to
  ignore).

## Consequences

- `CapabilityButton`'s new `selected` prop and the modal `accessible={false}` fix are additive/
  corrective for every existing call site — no call site needed to change to keep working.
- The `?fontScale=` demo capability is a real, reusable addition to the ADR-HEARTH-157 harness for
  future Dynamic Type spot-checks, not a one-off script.
- `theme.textTertiary`'s new hex value is the only visible color change; it is strictly lighter
  (more legible), so nothing that previously passed contrast can newly fail.
