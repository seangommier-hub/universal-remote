# ADR-HEARTH-214: Visual card sweep (header title clipping, Prime Video tile truncation)

**Date:** 2026-10-06
**Status:** Accepted, implemented

## Context

Sean, directly: "visual agent needs to fix many cards, check them by looking at each tab and
taking a screenshot to solve issues."

Checked every top-level tab/screen reachable from the app (Devices tab in every layout mode —
all/now, type/room grouping, collapsed sections, kid mode; an LG, Samsung and offline-Roku remote
screen including Remote/Keypad/Keyboard sub-tabs; Settings — Family Command Center connect form,
household phones, household remotes, device sharing; the Feeder tab; Home Assistant sync, Assist,
and six entity-control screen types (garage, lock, thermostat, fan, scene, alarm); the six-camera
Family Command Center list and a camera's own entity screen; the Discover-devices flow; the
Activity editor) at two viewport widths (393×852 and 428×926, `resize_window` "mobile"-class
presets) using the `?demo=1` fixtures, per screen via `?screen=` (see
`scripts/ui-verify/scenarios.mjs` for the full catalog this sweep walked).

`expo start --web` (the `hearth-web` launch config) throws `getItemAsync`/`getValueWithKeyAsync`
errors from `expo-secure-store`'s web shim before `DemoGate` ever resolves, so every screen stayed
on the empty "Connect to your home" state regardless of `?demo=1` — a dev-server-only, pre-existing
environmental issue (same class of thing ADR-HEARTH-205 already flagged for the `ui-verify`
harness's own unrelated `devices-now-empty` hang), not something this sweep caused or fixed.
Verification instead used this project's own established, working mechanism for rendering demo
screens in a browser: `npx expo export -p web`, served statically and driven with the same
`?demo=1&screen=` scheme `scripts/ui-verify/run.mjs` already uses.

## Decisions

1. **Devices header title collapsed to "H..." on phone-width screens.** `DeviceListScreen.tsx`'s
   `titleRow` packs the "Hearth" title and the Home/Away `ConnectivityBadge` into one row beside
   a 44px `brandMark` and (now, after ADR-HEARTH-213 landed) three 44px header icon buttons. At a
   393pt viewport that leaves `headerText` only ~121px total (393 − 48 outer padding − 4×44 fixed
   squares − 4×12 header gaps). Without wrap, flexbox's default behavior shrinks the flexible
   sibling first — `title` has `flexShrink: 1`, `ConnectivityBadge` has `flexShrink: 0` — so the
   badge kept its full width and the title got squeezed down to an unreadable "H...". The intended
   rescue, `adjustsFontSizeToFit`, is iOS-only (already documented at this exact call site,
   ADR-HEARTH-208) and is a no-op on web/Android, so this wasn't a demo-only artifact — it
   reproduces on any non-iOS build. Fix: `titleRow` gains `flexWrap: "wrap"` (same pattern this
   file's own `sectionLabelRow` already uses for its own large-text overflow), so the badge drops
   to its own line under the full "Hearth" title instead of stealing its width. Confirmed at
   393×852 (badge wraps, title reads fully) and 428×926 (both fit on one line, unchanged from
   before) — no regression at the wider width.
2. **"prime video" streaming tile truncated to "prime vi..." on every platform but iOS.**
   `StreamingAppTile.tsx` relies on the same `adjustsFontSizeToFit` mechanism to shrink the
   11-character "prime video" wordmark to fit its ~60px tile at this card's width — the tile's own
   comment already documents that iOS settles on the `minimumFontScale` floor of 0.7 to make it
   fit. On web/Android that shrink never fires, so the tile showed a bare, truncated
   "prime vi..." beside three full wordmarks (NETFLIX, hulu, YouTube) — inconsistent sizing
   between sibling tiles, not a stylistic choice. Fix: declared `fontScale: 0.7` as the tile's own
   base size in `STREAMING_APPS` (the same per-tile `fontScale` mechanism Hulu's `1.35` already
   uses), so every platform renders what iOS was already settling on instead of only iOS.

## Not changed

- The Devices header subtitle ("One home. One remote.") still truncates to "One home. One ..." on
  phone widths for the same iOS-only-shrink reason as the title. Left alone: it's a secondary
  descriptive line (not the illegible single-letter brand name the title became), and it's the
  exact before-state ADR-HEARTH-180/208 already knowingly accepted at this call site rather than a
  new regression this sweep introduced.
- `remote-roku-offline`'s ~62px bottom overflow on the offline Roku remote screen (utility row cut
  off below the fold at 393×852). Pre-existing and already non-enforced in this project's own
  `ui-verify` harness (`assertFit: false` for that scenario specifically) — a remote-layout
  redesign per ADR-HEARTH-016/205, not a quick card fix.
- Settings' "Share mine" / "Load shared" button pair (content-sized, slightly different widths).
  Unlike Cancel/Save (ADR-HEARTH-208, a primary confirm/cancel pair now forced to `flex: 1`), these
  are two independent secondary actions — a minor, non-jarring width difference, not a broken
  layout.
- Everything else checked (Devices in every grouping/kid-mode variant, Settings' household
  phones/remotes screens and device-sharing toggles, the Feeder "Add Squirrel Feeder" form, the
  Samsung and LG remotes' Keypad tab, every Home Assistant entity screen sampled, the six-camera
  list and a camera entity screen, Discover's ready/needs-a-step device lists, the Activity editor)
  rendered cleanly at both viewport widths with no overlap, clipping, or misalignment — left as-is.

## Verification

- `npx tsc --noEmit`: clean.
- `npx jest --silent --testPathIgnorePatterns="/node_modules/" "/.expo/" "/runner/" "/scratch/"`
  (same worktree-path override as ADR-HEARTH-205, since the project's own ignore list excludes
  `/.claude/` and this worktree lives under it): **2370 passed, 1 failed, 18 skipped, 2389 total**
  — the single failure is the same pre-existing, unrelated `runner/shims/shims.test.ts`
  (`ws`'s `WebSocketServer` constructor issue in the Node test-runner shim) ADR-HEARTH-205 already
  documented, unchanged by this sweep.
- Both fixes are pure styling/data changes (a `flexWrap` token, a per-tile `fontScale` value) — no
  new conditional logic, so no new test coverage needed per this project's own convention.
- Re-screenshotted the Devices header and both the Samsung (8-item, worst case) and LG utility rows
  after rebasing onto `origin/main` once PRs #1–#3 landed (adding the unconditional "Call Center"
  button, ADR-HEARTH-213) — the existing `flexWrap`/`rowGap` fallback in `UtilityActionsRow.tsx`
  handled the new 8th/5th item correctly with no clipping at either viewport width.
