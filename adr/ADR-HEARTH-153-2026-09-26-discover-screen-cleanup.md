# ADR-HEARTH-153: A calm, grouped, dismissible Discover list

Date: 2026-09-26
Status: Accepted

## Context

Sean: "continue improving the device addition process. also clean up the page on the new suggested
devices screen." ADR-HEARTH-148 lists EVERY device (principle: "any device on the network should be
available for adding"). Real household data: the Pi found 28 devices, 5 identifiable (LG TV, an
offline LG, a Roku, an Xbox, a possible Samsung) and 23 noise (router, 7 Ring cameras, 3 Echo
devices on Espressif chips, laptops, randomized-MAC iPhones, a VoIP phone, a printer).

Problems found in the 148 screen:
1. 23 noise rows given the same weight as 5 real devices; the real ones were buried.
2. The home Suggested list rendered all of them, a wall of cards on the main screen.
3. Offline recognized devices looked identical to online ones; no "Add anyway" wording.
4. No way to dismiss a device or say what it is; the brand picker only appeared after a failed Identify.
5. Already-added devices took list space as "Added" rows.
6. Titles fell back to a bare IP; subtitles never said why a brand was guessed.
7. No search, no scan freshness, no distinct empty states (all added / unreachable / FCC not set up).
8. Small tap targets and thin accessibility labels.

## Decisions

- **Sections** (`discoverySections.ts`, pure): "Ready to add" (recognized, online), "Recognized,
  offline" (button says "Add anyway"), then ONE collapsed row "N other devices - show". Expanded, the
  rest is grouped by kind (TVs & media, Cameras, Phones & computers, Network gear, Other), likely
  candidates first, offline last. Headers carry counts. Already-added devices are left out.
- **Kind** (`deviceKind.ts`): the Pi's new `kind` field drives grouping. When it is missing or
  "unknown" a light client-side guess from friendly name / model / hostname / vendor (or the brand's
  category) fills in, so an older Pi still gets grouping.
- **Row**: brand icon or kind icon; title = friendlyName, else brand label (+ model), else model,
  hostname, vendor, "Unknown device"; subtitle = IP plus why ("Answered as LG TV", "Looks like ...",
  "Best guess: ...", "Set to ...", "Off right now"); exactly ONE primary button (Add / Add anyway /
  Identify). Rare actions live in a menu (long-press, an explicit "..." button, and a VoiceOver
  custom action): "Not a remote device - hide" and "It's a ..." (choose the brand). 44pt minimum
  targets, accessibilityRole/Label/State on every control.
- **Hidden / labels** (`discoveryLabels.ts`, `useDeviceLabels.ts`): decisions are saved on the phone
  (AsyncStorage, keyed by MAC else IP) and pushed best-effort to the Pi through the shared
  LAN-then-public client (`fccFetch`) as `PUT /api/integrations/hearth/discover/labels`. A 404 or
  network failure is logged and ignored, so it works with an older Pi. The Pi's `hidden` and
  `labelBrand` fields apply household-wide; this phone's own label wins. Hidden devices sit under a
  "Hidden (n)" row at the bottom and can be shown again, so nothing is ever lost.
- **Search** appears when more than 8 devices are listed; it filters name, address, vendor,
  hostname, model and brand and opens the collapsed lists while active.
- **Empty states** (`pickScreenState`): scanning, "Nothing new found - your devices are all added",
  "Can't reach your home network" (classifyNetworkFailure + NetworkFailureNotice), "Set up Family
  Command Center first", "Nothing found right now".
- **Scan feedback**: compact spinner, "Scanned N seconds ago" (ticks every 5 s), pull-to-refresh.
- **Home Suggested** shows at most 3 recognized, ready-to-add devices plus "See all N devices on
  your network" into Discover; it renders nothing when no recognized device is ready (Discover stays
  reachable from the existing scan link). `DeviceListScreen` gains one prop pass-through (`onSeeAll`).
- Titles and subtitles changed from ADR-148 (nameless devices read "Unknown device", not their IP);
  the affected assertions in `discoveryRows.test.ts` were updated, not weakened.

## Decision log (ADR-GLOBAL-002)

Decided under a fixed brief from Sean with no live user to ask:
- Q: lighting and smart plugs under "Other" or "TVs & media"? A: "Other", but sorted first there.
- Q: what does an "It's a ..." choice do? A: it relabels the device (row becomes Ready to add); the
  person then taps Add. Choosing a brand after a failed Identify still starts the add directly.
- Q: show hidden devices' Add button? A: yes, hidden rows keep their normal button.

## Remaining

- The Pi `kind` / `friendlyName` / `hidden` / `labelBrand` fields and the labels endpoint are coded
  against the agreed contract; nothing has run against the real Pi yet.
- No on-device check of the layout, long-press or VoiceOver flow.
- The kind guess is keyword based and will mislabel some devices; the Pi's `kind` supersedes it.
