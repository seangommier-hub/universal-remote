# ADR-HEARTH-173: Rooms, favorites and ordering on the Devices tab

Date: 2026-09-26
Status: Accepted
Implements: ADR-HEARTH-162 items 9-10 (reorder devices, favorites, pinned row; rooms as grouping)

## Context
The Devices tab was one flat list. Households with many devices need to group them by room, keep a few at the top, and choose their order. The Family Command Center's shared-device schema drops unknown top-level fields, so anything stored on the Device itself would not sync and, worse, would be overwritten whenever a shared device is re-imported.

## Decisions
1. **Layout is local per phone, in its own record.** `hearth.deviceLayout.v1` in AsyncStorage (the same storage as devices) holds `{ rooms, favorites, order, collapsedRooms }` keyed by device id. It never touches the Device object or sync. The existing unused `Device.roomId` is left alone.
2. **Migration.** Nothing to convert: a missing record, a record without newer fields, or damaged text all load as an empty layout, which renders the old flat list exactly. Removed devices are pruned on each save.
3. **Rooms:** optional free text (trimmed, 30 characters), with one-tap suggestions (Living Room, Den, Bedroom, Kitchen, Office, Kids, Basement, Garage) plus rooms already in use. Grouping is case-insensitive. When at least one device has a room, the list shows collapsible headers sorted by name with "Other devices" last; when none has, no headers appear. Collapsed state is saved.
4. **Favorites:** starred from the long-press menu, shown as a compact horizontal tile row above the list, in the order starred. A favorite also stays in its room list (with a small star), so the list is complete on its own.
5. **Ordering without drag:** "Move up / Move down" in the long-press menu swaps a device with its neighbor within its own section (room, or the flat list). The menu stays open so several steps can be taken; unavailable directions are greyed. Devices never moved keep their original order after moved ones.
6. **Structure:** pure logic in `src/core/layout/` (deviceLayout, deviceOrdering, deviceGrouping, all tested); persistence in `src/runtime/deviceLayoutPersistence.ts`; UI split out of DeviceListScreen into DeviceCard, DeviceListSections, DeviceActionsModal, SetRoomPanel (ADR-GLOBAL-003), which also brings DeviceListScreen under the 500 line limit.
7. **Verification:** demo `?layout=rooms|favorites` fixture and web-harness scenarios (rooms, favorites-flat, collapse, actions menu, set room, move down) checked at 393 width.

## Consequences
- Rooms, favorites and order do not follow a person to another phone or into the household. Sharing them would need a Pi schema change (a later ADR).
- Offline banner, share behaviour, status line, Add-all card and remote pages are unchanged.

## Questions asked and answered (ADR-GLOBAL-002)
Local versus synced layout: answered by the task brief (keep local unless trivial); it is not trivial because the Pi drops unknown fields.
