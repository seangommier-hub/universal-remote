# ADR-HEARTH-009: UI design pass — tonal elevation, icons, capability-driven layout

**Date:** 2026-09-08
**Status:** Accepted

## Context

Sean's feedback: the UI is "awful," and asked for a design pass informed by
research on current app design, not a guess. This is a visual/layout-only
change — no business logic, architecture, capability-gating, or prop API
changes (per Sean's explicit constraint and this project's layering rules in
`ARCHITECTURE.md`).

Researched 2025–2026 mobile UI patterns from smart-home / device-control
apps before touching any file:

- **Material Design 3's dark-theme guidance** — tonal elevation (surfaces
  step up in luminance/tint as they rise, rather than relying on drop
  shadows, which read poorly on an OLED-dark navy background) and a
  systematic type/spacing scale. (Google Codelabs, "Design a dark theme
  with Material and Figma.")
- **SmartThings / general smart-home app patterns** — modular interactive
  cards in place of plain lists, and per-device status conveyed via a
  compact indicator rather than buried in body text. (designmonks.co,
  "Home Automation App UI Design: Ideas to Improve Usability.")
- **Apple's TV Remote app / tvOS remote design** — a circular directional
  cluster (up/left/select/right/down arranged around a center button)
  rather than a stacked row of arrow glyphs, which is the pattern this pass
  applied to `UniversalTvRemote`'s d-pad. (9to5Mac, "Review: The new Apple
  TV remote"; Digital Trends, "How to get a D-pad on your Apple TV Remote
  app.")
- Also referenced: Sonos's 2026 "Sonos 27" redesign coverage (Engadget,
  Audioholics) for status-pill/pinned-item conventions, though Sonos's
  layout is closer to a media browser than a remote and wasn't directly
  applicable here.

No trademarked logos, exact brand colors as identity marks, or literal copy
from any researched app were copied — only layout/interaction *patterns*.

## Decision

1. **`src/ui/theme.ts`** extended (not replaced) with a proper design-token
   set: a tonal elevation ladder (`surface` → `surfaceRaised` →
   `surfaceOverlay`), status colors (`statusOn`/`statusOff`/`statusError`,
   used only for connection/power state, never brand identity), and
   `spacing` / `radius` / `type` scales so no screen hardcodes a pixel
   value going forward. The existing navy (`#12141C`→`#1B2030`) and ember
   (`#FFC773`→`#FF7A45`) identity colors from ADR-HEARTH-002 are unchanged.

2. **`@expo/vector-icons`** (Ionicons) added as a dependency
   (`@expo/vector-icons@15.0.2`, pinned exact to match this project's
   dependency-pinning convention) and installed via `npx expo install` for
   SDK-57 compatibility. It replaces the unicode/emoji glyphs (`▲` `◀` `OK`)
   in `UniversalTvRemote.tsx` with real vector icons. This is the one new
   dependency in this pass — justified because it's Expo-Go-compatible
   (bundled/maintained by the Expo team, no native linking step), and the
   task explicitly pre-approved it for this reason.

3. **`src/ui/CapabilityButton.tsx`**: added two *optional* props (`icon`,
   `shape`) and a third `variant` option (`"ghost"`, for de-emphasized
   actions like Cancel/Back). All existing call sites with none of these
   passed render exactly as before — the prop contract is additive, not
   changed. `shape="circle"` renders a fixed 52px round icon button, used
   for the new d-pad cluster.

4. **`src/ui/UniversalTvRemote.tsx`**: controls now grouped into tonal
   cards per function (Power / Volume / Channel / D-pad / Nav / Input),
   real connection and power state shown as pill badges instead of plain
   text, and the directional pad rearranged into the circular
   up/left-select-right/down cluster described above. The `has(device,
   capability)` capability gate is untouched — every `<View>` still wraps
   the exact same capability check it did before; only what renders inside
   changed.

5. **`src/ui/DeviceListScreen.tsx`**: device rows became cards with a
   category icon, and the four "+ Add X" buttons became a 2-column icon
   tile grid instead of a stacked column of pill buttons. No fake
   online/offline status dot was added — `DeviceListScreenProps` only
   receives `Device[]`, not live `StateStore` state, so showing a status
   indicator here would be fabricated data; that stays correctly absent.

6. **`src/ui/AddSonyDeviceScreen.tsx` / `AddSamsungDeviceScreen.tsx` /
   `AddLgDeviceScreen.tsx` / `AddRokuDeviceScreen.tsx`**: styling now comes
   from a new shared `src/ui/addDeviceFormStyles.ts` module (a
   `StyleSheet`, not a component) so the four forms look consistent
   without becoming one merged component — each screen keeps its own
   fields, pairing-wait copy, and brand-specific warning text exactly as
   before (Sony's PSK field, Samsung/LG's Allow/Deny-prompt warnings,
   Roku's no-pairing note). This matches the instruction to allow a shared
   *style* pattern while keeping the four screens architecturally separate.

7. **`App.tsx`**: only the top-level container/back-row styles and the
   `< Devices` back button's presentation changed (now icon + ghost
   variant); the `Screen` union type and all screen-switching branches are
   untouched.

## Rationale

- Tonal elevation over shadows was chosen because React Native's
  cross-platform shadow APIs (`shadowColor`/`elevation`) render
  inconsistently between iOS and Android and read muddy on a near-black
  background — the researched M3 guidance's tint-based approach avoids that
  without any new dependency.
- Ionicons (bundled via `@expo/vector-icons`) over `react-native-svg` icon
  sets or custom SVGs: zero native linking, already Expo-Go-safe, and
  covers every glyph this pass needed (power, volume, chevrons, tv, etc.)
  without adding a second icon library.
- Kept every prop interface additive-only so `App.tsx` needed zero logic
  changes — verified by `npx tsc --noEmit` passing with no changes to
  `App.tsx`'s component usage beyond the two lines noted in point 7.

## Consequences

- One new dependency: `@expo/vector-icons@15.0.2`. No other new
  dependencies (no react-navigation, no animation library) — screen
  transitions remain the existing `useState`-driven swap in `App.tsx`,
  matching `ARCHITECTURE.md`'s explicit "not before" stance on navigation
  libraries.
- `src/ui/addDeviceFormStyles.ts` is new. It is a style-constants module,
  not a component — the four Add*DeviceScreen files remain separate
  per-brand components as required.
- Verification performed: `npx tsc --noEmit` clean; `npx jest` — 66/66
  tests passing across 11 suites (unchanged from baseline, no test files
  touched); the running tunnel dev server (`localhost:8095/status`) stayed
  `packager-status:running` throughout, and a forced bundle re-fetch after
  all edits returned HTTP 200 (848 modules, up from 733 pre-change due to
  the new icon library) with no error/fail lines in the bundler log.
- Follow-up not done here (out of scope): no real device/online status is
  shown on the device list card (see point 5) — wiring that in would need
  `DeviceListScreen` to accept `StateStore`, which is a prop-API change
  this pass deliberately avoided.
