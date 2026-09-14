# ADR-HEARTH-063: "Setup This Device" guided walkthrough for the manual-add screens

**Date:** 2026-09-13
**Status:** Accepted, implemented

## Context

Sean, directly, after tonight's Sony TV mixup (a device that turned out to be online the whole
time, just misidentified by a generic MAC-vendor lookup rather than checked on its own screen):
"any device add that requires additional steps should have 'Setup This Device' below it to bring
you to the page to do so and all associated operations that must happen be it user required or
otherwise needs to be included in that setup function... this includes input boxes for passwords
or any other field that may be needed, device setup and addition to hearth should be
straightforward for any user."

Every manual-add screen (`AddSonyDeviceScreen.tsx`, `AddSamsungDeviceScreen.tsx`,
`AddLgDeviceScreen.tsx`, `AddRokuDeviceScreen.tsx`, `AddYamahaDeviceScreen.tsx`) already had a
passive gray "hint card" with the required steps as a paragraph of prose. Functionally the
information was all there; the ask is about discoverability and structure — a labeled, numbered
walkthrough a user actually notices and follows, not a paragraph easy to skim past.

True cross-app deep-linking into a TV's own on-screen settings menu isn't technically possible —
there's no URL scheme a phone app can use to jump into a Sony/Samsung/LG TV's Settings screen. "The
page to do so" is implemented as an in-app full-screen guide instead, reached by a clearly-labeled
button, which is the closest real equivalent.

## Decision

1. **`deviceSetupSteps.ts`** (new): plain data — one `{title, steps: string[]}` per brand that
   genuinely needs it. Only **Sony, Samsung, and LG** get an entry:
   - Sony: enabling IP Control and setting a Pre-Shared Key on the TV is a real, required
     prerequisite the form cannot work without — the clearest case of "requires additional steps."
   - Samsung/LG: accepting an on-screen Allow/Deny prompt within a time limit (20s/30s) is a real,
     required user action, just one that happens *during* rather than *before* filling the form.
   - **Roku and Yamaha deliberately excluded** — both drivers' own docstrings already establish
     there's no pairing prompt and no PSK/password (ADR-HEARTH-007/054). A "Setup This Device"
     button with no real steps behind it would be worse than no button, the same reasoning
     `BRAND_MATCHERS`/capability-declaration comments elsewhere in this codebase already apply to
     not claiming a capability that isn't real.
2. **`DeviceSetupGuideScreen.tsx`** (new): a shared, reusable full-screen numbered walkthrough
   component. Takes a `guide` (from `deviceSetupSteps.ts`) and `onDone`. Kept generic/data-driven
   rather than one bespoke screen per brand — the only thing that differs between Sony/Samsung/LG
   is the step text, not the layout.
3. Each of the three Add\*DeviceScreen components gained local `showSetupGuide` state and a
   "Setup This Device" button (plain ghost-variant `CapabilityButton`, no icon — matching this
   project's own established finding that `CapabilityButton` never shows icon and label together)
   placed directly below the existing hint card, above the input fields — "below it," per Sean's
   own phrasing. Tapping it swaps the whole screen to `DeviceSetupGuideScreen`; "Done" returns to
   the exact same Add screen, state (typed IP, name) intact, ready to continue.

## Testing

No UI component in this codebase has a test today (`src/ui/**/*.test.*` is empty, same fact
ADR-HEARTH-051 already noted) — consistent with that, no new UI test was added for this purely
presentational addition. `npx tsc --noEmit`: clean. `npm test`: 27 suites / 264 tests, unaffected
(this change touches no driver/runtime logic). Live-verified on the Android emulator: the Sony Add
screen shows "Setup This Device" directly under the hint card, and tapping it opens the full
numbered guide, which was screenshotted and read back to confirm the six real steps render
correctly.

## Update 2026-09-14: Roku added — the original exclusion was wrong

Re-reading `AddRokuDeviceScreen.tsx`'s own existing hint text while doing an unrelated pass
surfaced a self-contradiction in this ADR's original reasoning: Roku was excluded on the grounds
of having "no real extra step," but the hint text already on that screen says otherwise — "make
sure 'Control by mobile apps' is enabled (Settings → System → Advanced system settings) if the
connection fails." That's a real, if usually-already-on, prerequisite toggle, not nothing. Added
`ROKU_SETUP_GUIDE` to `deviceSetupSteps.ts` and wired it into `AddRokuDeviceScreen.tsx` identically
to Sony/Samsung/LG. Yamaha remains excluded — its driver has no equivalent settings-screen
prerequisite of any kind to point to. Live-verified on the emulator: the guide renders correctly
with the real menu path. Full suite (272 tests) and `npx tsc --noEmit` clean.

## Update 2026-09-14 (later): SmartThings added too — and a real bug caught live

Same audit pass: `AddSmartThingsOutletsScreen.tsx`'s real prerequisite (ADR-HEARTH-042's own
confirmed facts — "Hearth" is an unpublished WEBHOOK_SMART_APP installed entirely through the
SmartThings mobile app, Developer Mode required) was even harder to find than Roku's — it only ever
surfaced as a one-line empty-state message *after* the outlet list came back empty, never shown
upfront. Added `SMARTTHINGS_SETUP_GUIDE`, deliberately not inventing an exact in-app Developer-Mode
tap path that hasn't been verified against SmartThings' real UI (unlike every other guide here,
which cites a primary source).

**Real bug caught live, not by inspection**: wiring in the same `if (showSetupGuide) return` pattern
used for the other four screens crashed this one with "Rendered fewer hooks than expected" the
moment "Setup This Device" was tapped on the emulator. Root cause: this screen, unlike the other
four, also calls `useEffect` — placing the early return before it meant the component rendered a
different hook count depending on `showSetupGuide`, a real Rules-of-Hooks violation. Fixed by moving
the early return after the `useEffect`. Checked all four other Setup-guide screens directly (none
have a `useEffect` at all) to confirm this bug class doesn't exist elsewhere. Live-verified after
the fix: the guide now opens and renders correctly. Full suite (272 tests) and `npx tsc --noEmit`
clean.

## Consequences

- Genuinely no user-facing change for Roku/Yamaha adds — correct, since neither has real setup
  steps to guide anyone through.
- If a future driver's manual-add screen needs this treatment, the pattern is: add an entry to
  `deviceSetupSteps.ts`, add the same three lines (state, early-return render, button) to that
  screen. Not abstracted further than that since three lines duplicated three times reads more
  clearly than a shared hook for something this small (ADR-GLOBAL-003 modularity without
  over-abstracting a two-call-site pattern into unnecessary indirection).
