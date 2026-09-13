# ADR-HEARTH-053: Remote screen's rename icon overlapped the power button on a realistic device name

Date: 2026-09-12

## Status

Accepted.

## Context

Sean, live tonight, reported buttons overlapping on the remote screen while testing on his actual
phone — the fourth report of an "overlap"/"gear" symptom this session, after three prior
investigations (ADR-HEARTH-046, -049, -050) each found and fixed a real-but-different layout bug,
plus one confirmed false lead (Expo Go's own dev-tools button, not a Hearth bug at all — re-confirmed
today by reading every affected screen's actual header code, which renders no such element).

This time, reproduced live on the Android emulator rather than guessed: the test device connected
tonight was named "192.168.1.218" (short, never overflows). Renaming it to a realistic name —
"Downstairs Living Room", matching Sean's actual TV's real location — immediately reproduced a real
overlap, confirmed by pixel-cropping the screenshot: the rename pencil icon sat on top of the power
button's circle outline.

Root cause, in `UniversalTvRemote.tsx`'s styles: `headerText` already carries `flex: 1, minWidth: 0`
(from an earlier fix, whose own comment specifically calls out "a long/renamed device name can force
this box wider ... overlapping them" as the exact risk being guarded against). But its child,
`deviceNameRow` (the `Pressable` wrapping the name `Text` and the pencil `Ionicons`), had
`alignSelf: "flex-start"` — which opts it OUT of stretching to `headerText`'s bounded, flex:1 width
(the default cross-axis behavior in a column parent) and instead sizes it to its own natural content
width. `deviceName`'s `numberOfLines={1}` therefore never had a narrower box to truncate against —
there was nothing to ellipsize since the row was never actually constrained — so a long name just grew
past its intended space and pushed the pencil icon into the power button.

## Decision

Removed `deviceNameRow`'s `alignSelf: "flex-start"` (reverting to the default `stretch`, so it's
properly bounded by `headerText`'s width) and added `minWidth: 0` to it (same New-Architecture Yoga
min-content-floor fix already used elsewhere in this file and in `DeviceListScreen.tsx`). Added
`flexShrink: 1` to `deviceName` so the `Text` itself can actually shrink within that now-bounded row,
letting `numberOfLines={1}`'s ellipsis do its job.

## Consequences

- A long/realistic device name (verified live with "Downstairs Living Room") now truncates cleanly
  ("Downstairs Living Ro…") with the pencil icon staying clear of the power button — confirmed via a
  fresh emulator screenshot after the fix, not just by re-reading the diff.
- `deviceNameRow`'s Pressable hit area now spans the full available header width instead of being
  tightly wrapped to its own content — a wider "tap to rename" touch target, not a behavior change of
  any consequence.
- Checked: this exact `alignSelf: "flex-start"` pattern doesn't appear anywhere else in `src/ui`
  (grepped), so this gap was specific to this screen's rename row, not systemic.
- This is now the fourth and — per this session's most careful audit yet — most likely genuine
  candidate for what Sean has been describing across multiple reports as "the gear/settings
  overlapping." The Expo Go dev-tools button explanation (still correct for the *gear icon itself*,
  confirmed again by reading every screen's header code) was probably being conflated with this
  separate, real, adjacent overlap on the same corner of the screen.

## Related

ADR-HEARTH-046, [[ADR-HEARTH-049]], [[ADR-HEARTH-050]], DeviceListScreen.tsx's own `minWidth: 0`
header fix (2026-09-12, same session)
