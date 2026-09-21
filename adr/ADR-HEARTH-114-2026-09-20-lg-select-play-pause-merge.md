# ADR-HEARTH-114: Merge Select and Play/Pause into one button — for LG only, not universally

**Date:** 2026-09-20
**Status:** Accepted, implemented

## Context

Sean asked to "compress the select/play/pause button into one." This directly revisits
ADR-HEARTH-068 (2026-09-15), which deliberately *split* them into two permanent, separate buttons
after two real bugs on Roku: Netflix's PIN-lock screen made playback state ambiguous (the merged
button defaulted to Select, which didn't reliably get a user past the overlay), and YouTube's
Skip Ad button needed Select at the exact moment `playbackState` was confidently "playing" (the
merged button had swapped to Play/Pause, hiding Select entirely). ADR-068's research found no
remote-control product — including Home Assistant's mature Roku integration — that had solved this
prediction problem, and stated the fix generalized to LG too (no LG-specific investigation was
done at the time).

Per ADR-GLOBAL-002, this conflict was flagged and asked about before any code changed. Sean's
answer: "there needs to be some sort of logic so that it works the same way as a firestick or
roku remote or any other does... where the select button functions for all three" — and then,
after research showed Roku/Fire TV physically ship *separate* dedicated Play/Pause buttons
(contradicting that specific premise): **"ok well the lg remote does all 3 with the scroll
function button in the middle of the remote"** — a direct, first-hand claim about his own real LG
TV's included Magic Remote.

## What the research found

1. **Roku and Fire TV do not merge these on real hardware.** Roku's own developer docs
   (developer.roku.com/dev/docs/remote-control-buttons) document "Select" as generic, app-defined
   UI-activation and "Play" as a separate, unconditional playback toggle. Modern Roku/Fire TV
   remotes ship both a D-pad OK button and a dedicated Play/Pause button below it. Hearth's
   `RokuEcpDriver.ts` already matches this: `select` sends ECP `Select`, `playPause` sends ECP
   `Play` — genuinely different commands.
2. **Where one button genuinely does serve both roles (Apple TV's Siri Remote clickpad, simple
   Google TV remotes), the disambiguation happens on-device via live UI focus** — click activates
   whatever's currently focused/highlighted on screen; it only falls through to play/pause when
   nothing is focused. That mechanism requires focus information no remote client can see over
   ECP, which is exactly the gap ADR-068 already confirmed and why merging on Roku would
   reintroduce its two bugs with no new information to prevent them.
3. **LG is a real, different case.** Sean's actual Magic Remote has no separate physical
   play/pause button at all — the same OK/wheel-click press serves all three roles on his real TV.
   Critically, `LgWebOsDriver.ts`'s `select` case already sends the literal `ENTER` SSAP button
   code (hobbyquaker/lgtv2) — the exact same code the physical remote's OK button sends. That means
   webOS's own on-device app focus logic is what already resolves the ambiguity on real LG
   hardware, the same focus-driven mechanism Apple TV/Google TV use, just not previously exploited
   by Hearth's separate `media.controls/play`/`pause` calls for its own `playPause` capability.

## Decision

Added a new, distinct capability `"selectPlayPause"` (`Capability.ts`) rather than special-casing
`device.driverId` inside `UniversalTvRemote.tsx` — this file's own stated design principle is that
every control is capability-gated, with no per-brand logic, and this preserves that exactly: only
`LgWebOsDriver` happens to declare it.

- **`LgWebOsDriver.ts`**: `LG_CAPABILITIES` replaces `"select"` and `"playPause"` with
  `"selectPlayPause"`. `executeCommand`'s merged case always sends `client.sendButton("ENTER")` —
  unchanged from the old `select` case — and no longer ever calls `ssap://media.controls/play` or
  `.../pause`. The existing command-history heuristic (`assumedInStreamingApp`/
  `selectPressesSinceLaunch`, ADR-HEARTH-051/2026-09-13) still drives the button's *cosmetic* icon
  only: press 1 after launching a streaming app stays "Select" (profile picker), press 2 flips to
  "playing," and every press after that now alternates playing/paused — folding in the old
  `playPause` case's toggle logic, still cosmetic, never gatekeeping which button is shown (that
  principle from ADR-068 is unchanged; there's only ever one button now).
- **`UniversalTvRemote.tsx`**: the d-pad center slot renders the merged button (icon/label reflect
  known `playbackState` when available, default "Select"/checkmark) whenever
  `has(device, "selectPlayPause")`; falls back to the old plain Select button when only `"select"`
  is declared. The always-visible Play/Pause row below the d-pad (`has(device, "playPause")`) is
  untouched in code — it simply no longer renders for LG, since LG no longer declares that
  capability. Roku is unaffected end to end.
- **Roku, Samsung, Sony**: no changes. `select`/`playPause` stay fully separate, per ADR-068 —
  Roku's case for keeping them separate is now further confirmed, not weakened, by this research.

## Testing

`LgWebOsDriver.test.ts`: removed the two now-dead `media.controls/play`/`pause` tests, renamed
the command-history describe block's press helper/assertions to `selectPlayPause`, and added a new
test confirming the toggle behavior for presses 3+ (alternates playing → paused → playing).
`npx tsc --noEmit` clean; full suite 910/910 passing.

## Consequences

- Sean's real, described hardware behavior is now replicated by Hearth's LG remote screen: one
  button, three functions, exactly like his physical Magic Remote.
- Not yet live-verified against a real Netflix PIN screen or YouTube Skip Ad on the actual LG TV
  (neither is reliably reproducible on demand) — flagged honestly, matching ADR-068's own
  precedent, rather than claimed as confirmed. If either turns out to fail in practice on webOS
  the way it did on Roku, the fix is to revert LG back to separate `select`/`playPause`
  capabilities — the two are still fully independent capability ids, nothing else depends on
  `selectPlayPause` existing.
- Establishes the pattern for any future driver where real hardware similarly merges the two: add
  it to the `selectPlayPause` capability rather than reintroducing driver-specific UI branching.
