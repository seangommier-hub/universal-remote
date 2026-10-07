# ADR-HEARTH-216: The remote screen measures its own fit and shrinks to never scroll

**Date:** 2026-10-07
**Status:** Accepted, implemented

## Context

Sean, directly: "the remote should have a dynamic layout where it is able to be on one screen no
matter the device... the settings and other elements can scroll but think of it as an actual
remote and it shouldn't need to scroll." Scope: `UniversalTvRemote.tsx` and whatever it renders —
every other screen keeps scrolling, unchanged.

`useResponsiveScale.ts` (ADR-HEARTH-040) already scales the remote's circular touch targets by
device **width**, but says so itself: it deliberately never measures or reacts to **height**. That
was fine as long as every capability combination happened to fit the one phone size it was tuned
and hand-checked against (ADR-HEARTH-135's own admission: "not measured on a device... may still
scroll on bigger capability sets"). It wasn't fine in general: measured on this branch, fresh off
`origin/main`, LG's remote (4 dynamic inputs, full utility row, streaming row, d-pad hub, keypad
and keyboard tabs) overflowed by **89px** at the iPhone 17 frame (393×852) the project's own
`scripts/ui-verify` harness checks — and `StreamingAppsRow.tsx`/`InputSelectionCard.tsx` had zero
scale-awareness of any kind (grepped `scale` in both — no hits), unlike the d-pad/rocker/utility
circles `useResponsiveScale` already covers.

ADR-HEARTH-135's own padding fix and ADR-HEARTH-157's harness were real but partial: hand-tuned
against one viewport, admittedly fragile, and never re-derived when new buttons were added later
(ADR-HEARTH-213's "Call Command Center" button, ADR-HEARTH-134's bigger utility circles). This
ADR replaces "shrink the one thing that overflowed on the one phone I checked" with a mechanism
that actually measures.

## Decision

**`src/ui/fitScale.ts`** — pure, framework-free math (same shape as `tapStreak.ts`/
`holdRepeatScheduler.ts`): `nextFitScale(current, availableHeight, contentHeight)` returns the next
corrective scale factor, shrink-only, bounded below by `FIT_SCALE_FLOOR` (0.5) and above by 1. It
targets `availableHeight - FIT_SAFETY_MARGIN_PX` (16px), not the harness's own bare 1px tolerance —
converging to exactly 0-1px of spare on the one viewport this harness checks would repeat the
exact mistake ADR-HEARTH-135/121's own history is full of ("fits with 1px to spare" that then
failed the moment one more thing was added). The proportional estimate
(`current * (target / contentHeight)`) deliberately undershoots on the first try — content height
is `fixed + scalable * fitScale`, not purely proportional, since padding/gaps/text don't shrink
with this factor at the same rate circles do — so the caller re-measures and calls again rather
than trusting one estimate; this is what guarantees the loop terminates rather than oscillating.

**`src/ui/useRemoteFitScale.ts`** — thin React wiring. Takes a `resetKey` (this screen passes
`` `${device.id}:${activeTab}` ``) and returns `{ fitScale, onLayout, onContentSizeChange }`, wired
directly onto the existing `ScrollView` in `UniversalTvRemote.tsx`:
- `onLayout` — the ScrollView's own rendered height is the real "available height" this screen has
  to fill.
- `onContentSizeChange` — react-native-web fires this from the content container's own layout,
  giving the actual rendered height of everything stacked inside, at the current `fitScale`.
- Each measurement calls `nextFitScale`; a change schedules a re-render at the new `fitScale`,
  which re-triggers `onContentSizeChange` with the new (smaller) height, converging in a handful of
  real layout passes (no manual timer/animation loop) — capped at 20 steps as a defensive backstop
  against unforeseen jitter, well above what a real correction needs.
- Resets to `fitScale = 1` whenever `resetKey` changes (different device, different tab) or the
  available height itself changes by more than a few px (rotation/resize) — simpler and more
  obviously correct than trying to grow a shrunk value back up without overshooting into fresh
  overflow, and cheap enough to be invisible for content this size.

**Applied, deliberately not uniformly:**
- The d-pad/rocker hub (`DpadCluster.tsx`/`VolumeChannelCard.tsx`) is combined with the existing
  width-based `scale` into one `hubScale = scale * fitScale` and passed down as a single unit — the
  disc, its arrows, and the rocker columns must shrink together or the "arrow lands exactly tangent
  to the disc's rim" geometry (ADR-HEARTH-037) breaks.
- Every stacked card's own vertical padding/gap (the screen's top-level `content` padding, the hub
  card, the utility card, the streaming/input cards' `compactCard` padding, the input grid's gap)
  scales by `fitScale` alone — real height with no legibility cost.
- As a **genuine last resort** — reached only once the hub and every card's own padding have
  already hit the floor and the screen still doesn't fit — `UtilityAction.tsx`'s own circle size
  and each `InputSelectionCard.tsx` pill's own vertical padding also scale by `fitScale`. These
  ship today at 52px (`size="sm"`, ADR-HEARTH-134) with real room above the 32px "xs" size
  ADR-HEARTH-121 already shipped on this exact row; shrinking toward, not below, an already-shipped
  size on a genuinely tight device is a real, bounded tradeoff, not the "control nobody can tap"
  failure this feature's own task explicitly warned against.
- **Never** touches font size or `StreamingAppTile`'s own tile proportions — ADR-HEARTH-040's
  "spacing/fonts are a different axis from device size" reasoning still holds; this is an
  orthogonal, height-only correction, not a reversal of that decision.

`FIT_SCALE_FLOOR` was tuned empirically, not guessed: 0.7 left LG overflowing by 47px at an iPhone
SE (375×667, the shortest realistic phone this app supports); 0.6 left 17px; 0.5 reaches 0px (4px
spare) — the worst real combination this app has today (LG's heaviest capability set on the
shortest supported phone), verified by screenshot to still read clearly and stay tappable (see
Verification).

## Verification

**`scripts/ui-verify/run.mjs` (393×852, the harness's one fixed viewport), every `assertFit: true`
scenario, before (fresh `origin/main`, no fit-scale code) vs. after:**

| Scenario | Before | After |
|---|---|---|
| `remote-lg` | FAIL, overflow 89px (content 858px) | PASS, overflow 0px, **15px spare** (content 754px) |
| `remote-lg-seek-tap-streak` | FAIL, overflow 89px | PASS, overflow 0px, 15px spare |
| `remote-lg-keypad` | PASS, 226px spare | PASS, 226px spare (unchanged — already fit) |
| `remote-lg-keyboard` | PASS, 257px spare | PASS, 257px spare (unchanged) |
| `remote-samsung` | PASS, 111px spare | PASS, 111px spare (unchanged — `fitScale` stays 1 the whole time on a device that never overflows) |

Every other scenario in `scripts/ui-verify/scenarios.mjs` (`--only=` with every name except the
pre-existing, unrelated `devices-now-empty` hang ADR-HEARTH-205 already flagged) was run before and
after: every non-remote screen's numbers are unchanged (those screens render nothing this ADR
touches), `remote-lg-fontscale-130/160` and `remote-roku-offline` stay `assertFit:false`/INFO-only
exactly as documented (a larger Dynamic Type size or the offline reconnect card are explicitly
allowed to still scroll) — `remote-roku-offline` in fact now fits (0px overflow, 15px spare) where
it previously didn't, a side effect of the same padding/gap shrink, not a goal of this change.

**Manual checks at other viewport sizes** (the harness only checks one): the Claude Browser pane's
tab is backgrounded by the host app (`document.hidden === true`), which — confirmed by temporary
instrumentation, since removed — stalls react-native-web's own `ResizeObserver`/layout-dispatch
pipeline entirely (a standard browser behavior for hidden tabs, unrelated to this feature; a real
phone is never "hidden" while someone is looking at it). Checked instead with a second, disposable
Playwright script reusing the harness's own `measureOverflow.mjs`/`staticServer.mjs` (always a
real, visible page):
- **iPhone SE (375×667)**, LG's heaviest fixture: 0px overflow, 4px spare at the floor — screenshot
  confirmed every control (d-pad, rockers, streaming tiles, input grid, utility row) still reads
  clearly and fills the screen with no clipping/overlap, nothing below ~26-36px.
- **A tablet-ish size (820×1180)**: 0px overflow, 74px spare, `fitScale` never left 1 (content fit
  comfortably without any correction) — screenshot confirmed nothing stretched or oversized.
- Samsung at the same SE size: 0px overflow, 16px spare.

**Tests:** `src/ui/fitScale.test.ts` (10 cases) — the pure math: no-op when already fitting (with
margin), shrinks proportionally on real overflow, never increases (monotonic shrink), bounded by
the floor, a no-op (not a crash) on an unmeasured zero/negative dimension, and two convergence
simulations (a feasible case converges within tolerance in under 10 steps; an intentionally
infeasible case still terminates at the floor rather than looping). Full suite:
`npx jest --testPathIgnorePatterns="/node_modules/"` (needed because this worktree lives under
`.claude/`, which the project's own ignore list excludes — same override ADR-HEARTH-205 used) —
**2394 passed, 18 pre-existing skips, 1 pre-existing unrelated failure**
(`runner/shims/shims.test.ts`'s `ws` `WebSocketServer` constructor issue, identical to every prior
ADR that ran this same suite from this same worktree shape).

`npx tsc --noEmit`: clean, before and after every step of this change.

## Consequences

- The remote screen now has a real, general answer to "does this fit" instead of a per-viewport
  hand-tune — a future capability addition (another utility button, another input) degrades
  gracefully (more shrink, down to the floor) instead of silently reintroducing a scroll the way
  ADR-HEARTH-213's own Call Command Center button nearly did to this exact row.
- A genuinely infeasible combination (more content than even the floor can absorb) is not currently
  possible on any fixture this app ships with the real floor (verified at SE), but if one existed,
  this converges to the floor and stops there rather than achieving the one truly inviolable
  "zero scroll" guarantee at any cost to legibility — Sean's own "a control nobody can tap isn't a
  real fix either" instruction, not an oversight.
- `StreamingAppsRow.tsx`/`InputSelectionCard.tsx`/`UtilityActionsRow.tsx`/`UtilityAction.tsx`/
  `DpadCluster.tsx`/`VolumeChannelCard.tsx` all gained a new required `fitScale` prop (defaulting
  nowhere, since every call site is this one screen) — no other screen renders any of them, so
  nothing else is affected.
- A brief (sub-frame, no animation) convergence happens on first mount of a device/tab whose
  content overflows, and again on an actual resize/rotation — not visually tested for a perceptible
  flash on real native hardware (only via the always-visible Playwright checks above), flagged
  honestly per this screen's own convention of saying what wasn't checked.
