# ADR-HEARTH-193: Group the Devices tab by type (Room kept as an alternative)

Date: 2026-09-27
Status: Accepted
Amends: ADR-HEARTH-173 (default grouping only); keeps ADR-HEARTH-176 and ADR-HEARTH-189 lists consistent with it

## Context
Sean's request, verbatim: "all items should be grouped within the app. tv, plugs, lights, devices, etc." The Devices tab was one flat list until rooms were assigned (ADR-HEARTH-173). With Home Assistant entities (ADR-HEARTH-178), Ring cameras (ADR-HEARTH-191) and Alexa plugs (ADR-HEARTH-192) the flat list mixes TVs, plugs, sensors and cameras.

This is a product-default change made on Sean's explicit request. It reverses ADR-HEARTH-173's "no rooms set means a flat list" default; it does not remove anything ADR-173 built.

## Decisions
1. **Type is the default grouping; Room is preserved.** A small "Group by  Type | Room" switch sits on the "Connected Devices" label row. Room mode is ADR-173's behaviour exactly as it was (room headers, "Other devices" last, flat list when no room is set).
2. **Fixed section order, empty sections hidden, header with count.** TVs & Streaming, Audio, Lights, Plugs & Outlets, Cameras, Gaming, Vacuums & Robots, Climate & Fans, Covers & Locks, Sensors, Actions & Scenes, Other.
3. **Every DeviceCategory is mapped explicitly** (`GROUP_BY_CATEGORY` in `src/core/layout/deviceTypeGroups.ts`, a `Record<DeviceCategory, ...>` so `tsc` fails on a missing key). A unit test also parses the union from `src/core/types/Device.ts` and fails if a category is declared without a group, if the map has a stale key, or if a group is unused. A category unknown at runtime (newer phone or Pi) falls back to Other, so nothing vanishes.

   | Group | Categories |
   |---|---|
   | TVs & Streaming | tv, streaming |
   | Audio | audio |
   | Lights | lighting |
   | Plugs & Outlets | outlet |
   | Cameras | camera |
   | Gaming | gaming |
   | Vacuums & Robots | vacuum, feeder |
   | Climate & Fans | climate, fan |
   | Covers & Locks | cover, lock, alarm |
   | Sensors | sensor |
   | Actions & Scenes | action |
   | Other | other |
4. **Persistence in the existing record** `hearth.deviceLayout.v1` (no new key, no version bump): new optional fields `groupBy` ("type" | "room", default "type") and `collapsedTypes` (type-group ids). `normalizeLayout` tolerates their absence and drops junk or unknown ids. Room collapse keeps its own `collapsedRooms` list.
5. **Favorites and ordering.** The Favorites row stays pinned above all groups; a favorite also stays in its section (with the star). "Move up / Move down" swaps within the device's own section in either mode.
6. **One shared grouping module.** `buildDeviceListModel` (`deviceGrouping.ts`) builds both modes; `DeviceListSections` renders them for the Devices tab, kid mode (ADR-176) and guest mode (ADR-189). Kid and guest lists apply their allow-lists first, then the same grouping, and follow the phone's Type/Room choice; they do not show the switch (it is a setup control).
7. **Structure (ADR-GLOBAL-003).** New: `deviceTypeGroups.ts` (map, order), `GroupBySwitch.tsx`, demo fixture `demoTypeHousehold.ts`. Collapse toggling and group-by changes go through `useDeviceLayout` (`toggleSection`, `changeGroupBy`).
8. **Verification.** Demo `?household=types&layout=types` (a device in every section) plus web-harness scenarios at 393 width: Type mode (scrolled through every section), collapsed sections, switch to Room, long-press menu, kid mode, and 1.6x text. Existing `layout=rooms|favorites` demo layouts now pin Room mode so their earlier scenarios are unchanged.

## Questions asked and answered (ADR-GLOBAL-002)
Decided by the implementer inside the task brief; Sean can overrule any of them:
- **Alarm panels** go with locks under "Covers & Locks" (security devices); the brief did not name a group for `alarm`.
- **Feeders** go under "Vacuums & Robots" (an automatic motorised appliance); the brief did not name a group for `feeder`. Feeders normally live on the Feeder tab.
- **Yamaha and Denon receivers** are registered with category `tv` today, so they land in TVs & Streaming; the category was left alone.
- **Existing phones with rooms already set** open in Type mode after this update (the request says default Type); their rooms are untouched and one tap on "Room" restores the old view.
- **Kid and guest lists** follow the phone's saved choice rather than always using Type.

## Consequences
- The list is longer with headers when a household has many kinds of device; sections collapse and the choice is remembered per phone.
- Group-by and collapsed sections are local per phone, like the rest of the layout (ADR-173).
- Offline banner, Add-all card, status line, share switch, long-press menu and remote pages are unchanged.
- Known gap: no web-harness entry exists for the guest list (its role comes from the phone's Pi token); it shares `DeviceListSections` and `useDeviceLayout` with the kid list that was screenshotted.
