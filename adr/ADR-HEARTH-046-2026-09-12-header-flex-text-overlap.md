# ADR-HEARTH-046: Device-list and remote-screen headers overlap their icon buttons — Yoga's default min-content floor on `flex: 1` text

Date: 2026-09-12

## Status

Accepted.

## Context

Sean, testing live on his own iPhone via Expo Go tonight (ADR-HEARTH-045's
`--go` fallback): "the settings gear overlapping other items" on the app's
home/device-list screen. There is no literal gear icon on `DeviceListScreen`
— the two round icon buttons in its header (`hardware-chip-outline` for the
Command Center trackpad, `link-outline` for Family Command Center pairing)
are the most likely thing being described informally as "the settings
gear," though Sean has used that exact phrase once before (ADR-HEARTH-038,
about `DiscoverDevicesScreen`'s Cancel button) for an unrelated safe-area
issue that was already fixed and isn't reproducible from source today.

`DeviceListScreen.tsx`'s `header` row packs four things into one
`flexDirection: "row"`: `brandMark` (fixed 44×44), `headerText` (`flex: 1`,
holding the "Hearth" title + "One home. One remote." subtitle, both
unconstrained `<Text>` with no `numberOfLines`), and two `fccButton`s (fixed
44×44 each). Exact-arithmetic check (this file's own established
convention — see UniversalTvRemote.tsx's "348px wide... 53px too wide"
comment): at a 375pt baseline, `container`'s `paddingHorizontal:
theme.spacing.xl` (24 each side) leaves 327px; the three fixed 44px boxes
plus three `spacing.md` (12) gaps consume 168px, leaving only 159px for
`headerText`. That's tight but not obviously broken by character-count
alone — the actual mechanism is a Yoga behavior, not a naive width overrun:
a `flex: 1` item (`flexBasis: 0%`, `flexGrow: 1`) still gets an automatic
minimum main-size floor equal to its content's min-content size unless
`minWidth: 0` is set explicitly, per Flexbox's spec-compliant `min-width:
auto` default. Older/legacy-architecture Yoga versions were looser about
enforcing this; the New Architecture's Yoga rewrite (which SDK 57 requires
— no legacy-architecture option exists anymore, confirmed via Expo's SDK 55
changelog dropping Legacy Architecture entirely, and SDK 57 ships fully on
New Architecture per `AGENTS.md`'s own warning to not assume old API/engine
behavior) enforces it correctly. With no `numberOfLines` and no
`minWidth: 0` override, `headerText`'s own unbreakable/near-unbreakable
text content can force the box wider than its allotted 159px, pushing the
row's total width past the screen and overlapping the two `fccButton`
icons — reading exactly as "the settings gear overlapping other items."

The exact same shape exists in `UniversalTvRemote.tsx`'s `headerRow`:
`headerText` (`flex: 1`, holding a user-renamable device name — up to 40
characters, `AddSonyDeviceScreen.tsx` et al. — plus manufacturer/model
meta) sits next to a back chevron, a `|` divider, and up to two fixed
circular power buttons (`power`/`powerOn`/`powerOff` capabilities aren't
mutually exclusive). A renamed device with an ordinary-length name is a
substantially more likely real-world trigger of this exact bug class than
`DeviceListScreen`'s fixed two-word title/subtitle.

## Decision

Two changes, applied identically to both screens' `headerText` style and
the `<Text>` elements it contains:

1. `headerText: { flex: 1, minWidth: 0 }` — the standard, spec-correct fix
   for a flex item whose content shouldn't be allowed to dictate the row's
   width. Zero effect on any case where the content already fit; only
   matters when it didn't.
2. `numberOfLines={1}` on `DeviceListScreen`'s title/subtitle and on
   `UniversalTvRemote`'s device-name/meta text — so instead of a forced
   overflow, an unusually long value (a longer device name, a wider
   accessibility text-size setting) truncates with an ellipsis rather than
   spilling onto the neighboring icon buttons.

No gap/padding retuning, no button resizing, no sub-row wrapping — the
narrower fixes from the task's own suggested list weren't needed once the
actual mechanism (the min-content floor, not a raw arithmetic overrun) was
identified; `minWidth: 0` + `numberOfLines` addresses the mechanism
directly rather than buying a few more pixels of margin that the same bug
class could still exceed later (e.g., a longer future subtitle, a longer
device name, or Dynamic Type text scaling — `allowFontScaling` is on by
default per ADR-HEARTH-040).

## Rationale

Diagnosed by exact-dimension arithmetic (this file's own established
verification convention) plus reasoning from a documented, real Yoga/React
Native New Architecture behavior change, not by live device inspection —
Sean's phone wasn't accessible to this session mid-task, and no Android
emulator/react-native-web setup was available either (react-native-web
isn't a dependency of this project). Per the task's own explicit
allowance, static-arithmetic verification is acceptable when live
rendering isn't practical, matching how this exact class of bug has been
diagnosed and fixed elsewhere in this codebase before (ADR-HEARTH-016,
ADR-HEARTH-024).

`DiscoverDevicesScreen.tsx` was checked for the same risk shape and does
not have it — its header's `title` isn't a flex item at all (row uses
`justifyContent: "space-between"` with two natural-width children), so
there's no flex min-content floor to trip.

## Consequences

- `npx tsc --noEmit` clean.
- Not yet visually confirmed on Sean's real iPhone — same outstanding
  caveat as prior UI fixes tonight (ADR-HEARTH-038, -040, -045). Next real
  checkpoint: Sean confirming the home screen's header (and, if he renames
  a device, the remote screen's header) render without overlap.
- If the actual root cause turns out to be something else entirely (a
  different screen, or a genuinely different visual issue this diagnosis
  didn't anticipate), this fix is still correct and worth keeping on its
  own merits — `minWidth: 0` on a `flex: 1` text container next to fixed
  siblings is a real, spec-correct hardening with no downside, the same
  judgment call ADR-HEARTH-038 made about its own not-yet-confirmed fix.
- Scope: layout/rendering only. Did not touch `DiscoverDevicesScreen.tsx`,
  `FamilyCommandCenterDiscoveryProvider.ts`, or any driver `.connect()`
  method — those are a separate in-flight agent's work per this task's
  explicit instruction.

## Related

ADR-HEARTH-016, ADR-HEARTH-024, ADR-HEARTH-038, ADR-HEARTH-040,
ADR-HEARTH-045
